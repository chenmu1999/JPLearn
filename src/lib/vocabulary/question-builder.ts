import "server-only";

import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/db/client";
import {
  katakanaToHiragana,
  normalizeAnswer,
} from "@/lib/vocabulary/normalize-answer";
import {
  EXERCISE_TYPE,
  VOCABULARY_DIMENSION,
  type ExerciseType,
  type MasterySummary,
  type QuestionDTO,
  type QuestionOption,
  type VocabularyDetail,
  type VocabularyDimension,
} from "@/lib/vocabulary/types";

/** Question valid for 24 h — no real-time pressure in first version. */
const QUESTION_EXPIRY_MS = 24 * 60 * 60 * 1_000;

/**
 * Determine exercise type and target dimension for one session item.
 * For new words (status=NEW or no mastery) always start with reading.
 */
export function selectExerciseType(
  mastery: MasterySummary | null,
  hasExamples: boolean,
): { exerciseType: ExerciseType; targetDimension: VocabularyDimension } {
  if (!mastery || mastery.status === "NEW") {
    return {
      exerciseType: EXERCISE_TYPE.WRITING_TO_READING_INPUT,
      targetDimension: VOCABULARY_DIMENSION.READING,
    };
  }

  const { readingScore, meaningScore, spellingScore, contextScore } = mastery;

  if (readingScore <= meaningScore && readingScore <= spellingScore) {
    return {
      exerciseType: EXERCISE_TYPE.WRITING_TO_READING_INPUT,
      targetDimension: VOCABULARY_DIMENSION.READING,
    };
  }

  if (spellingScore < readingScore && spellingScore < meaningScore) {
    return {
      exerciseType: EXERCISE_TYPE.WRITING_TO_READING_INPUT,
      targetDimension: VOCABULARY_DIMENSION.SPELLING,
    };
  }

  if (meaningScore <= spellingScore) {
    return {
      exerciseType: EXERCISE_TYPE.READING_TO_MEANING_CHOICE,
      targetDimension: VOCABULARY_DIMENSION.MEANING,
    };
  }

  if (hasExamples && contextScore <= Math.min(readingScore, meaningScore, spellingScore)) {
    return {
      exerciseType: EXERCISE_TYPE.CONTEXT_WORD_CHOICE,
      targetDimension: VOCABULARY_DIMENSION.CONTEXT,
    };
  }

  return {
    exerciseType: EXERCISE_TYPE.MEANING_TO_WORD_CHOICE,
    targetDimension: VOCABULARY_DIMENSION.MEANING,
  };
}

/** Build, persist, and return a safe QuestionDTO for the given vocabulary + exercise type. */
export async function buildAndSaveQuestion(
  vocab: VocabularyDetail,
  exerciseType: ExerciseType,
  targetDimension: VocabularyDimension,
  userId: string,
  assignmentId: string | null,
  sessionItemId: string | null,
): Promise<QuestionDTO> {
  const expiresAt = new Date(Date.now() + QUESTION_EXPIRY_MS);

  let promptData: Record<string, string>;
  let options: QuestionOption[] | null = null;
  let acceptedAnswers: string[];

  switch (exerciseType) {
    case EXERCISE_TYPE.WRITING_TO_READING_INPUT: {
      promptData = { writing: vocab.primaryWriting };
      // All accepted READING forms are valid answers
      const readingForms = vocab.acceptedForms
        .filter((f) => f.formType === "READING")
        .map((f) => f.value);
      if (readingForms.length === 0) readingForms.push(vocab.primaryReading);
      acceptedAnswers = readingForms;
      break;
    }

    case EXERCISE_TYPE.READING_TO_MEANING_CHOICE: {
      promptData = { reading: vocab.primaryReading };
      const correct = vocab.primaryMeaningZh ?? vocab.senses[0]?.meaningZh ?? vocab.lemma;
      const distractors = await getDistractorMeanings(vocab, 3);
      if (distractors.length < 3) {
        return buildAndSaveQuestion(
          vocab,
          EXERCISE_TYPE.WRITING_TO_READING_INPUT,
          VOCABULARY_DIMENSION.READING,
          userId,
          assignmentId,
          sessionItemId,
        );
      }
      const choice = createChoiceOptions(correct, distractors);
      options = choice.options;
      acceptedAnswers = [choice.correctOptionId];
      break;
    }

    case EXERCISE_TYPE.MEANING_TO_WORD_CHOICE: {
      const meaning = vocab.primaryMeaningZh ?? vocab.senses[0]?.meaningZh ?? vocab.lemma;
      promptData = { meaningZh: meaning };
      const distractors = await getDistractorWritings(vocab, 3);
      if (distractors.length < 3) {
        return buildAndSaveQuestion(
          vocab,
          EXERCISE_TYPE.WRITING_TO_READING_INPUT,
          VOCABULARY_DIMENSION.READING,
          userId,
          assignmentId,
          sessionItemId,
        );
      }
      const choice = createChoiceOptions(vocab.primaryWriting, distractors);
      options = choice.options;
      acceptedAnswers = [choice.correctOptionId];
      break;
    }

    case EXERCISE_TYPE.CONTEXT_WORD_CHOICE: {
      const example = vocab.examples.find(
        (e) => (e.sourceType === "CURATED" || e.sourceType === "SOURCE") && e.targetSurface,
      );
      if (!example?.targetSurface) {
        // Fallback: no usable example → use reading input instead
        return buildAndSaveQuestion(
          vocab,
          EXERCISE_TYPE.WRITING_TO_READING_INPUT,
          VOCABULARY_DIMENSION.READING,
          userId,
          assignmentId,
          sessionItemId,
        );
      }
      const blankSentence = example.japanese.replace(example.targetSurface, "＿＿＿");
      promptData = { context: blankSentence };
      const distractors = await getDistractorWritings(vocab, 3);
      if (distractors.length < 3) {
        return buildAndSaveQuestion(
          vocab,
          EXERCISE_TYPE.WRITING_TO_READING_INPUT,
          VOCABULARY_DIMENSION.READING,
          userId,
          assignmentId,
          sessionItemId,
        );
      }
      const choice = createChoiceOptions(example.targetSurface, distractors);
      options = choice.options;
      acceptedAnswers = [choice.correctOptionId];
      break;
    }

    default:
      throw new Error(`Unsupported exerciseType: ${exerciseType}`);
  }

  const saved = await prisma.vocabularyQuestion.create({
    data: {
      userId,
      vocabularyId: vocab.id,
      assignmentId,
      sessionItemId,
      exerciseType,
      targetDimension,
      promptJson: JSON.stringify(promptData),
      optionsJson: options ? JSON.stringify(options) : null,
      acceptedAnswersJson: JSON.stringify(acceptedAnswers),
      status: "ISSUED",
      expiresAt,
    },
  });

  return {
    questionId: saved.id,
    exerciseType: exerciseType as ExerciseType,
    targetDimension: targetDimension as VocabularyDimension,
    prompt: promptData,
    options,
  };
}

// ---------------------------------------------------------------------------
// Distractor helpers
// ---------------------------------------------------------------------------

async function getDistractorMeanings(
  vocab: VocabularyDetail,
  count: number,
): Promise<string[]> {
  const rows = await prisma.vocabularyEntry.findMany({
    where: { id: { not: vocab.id }, isActive: true, level: vocab.level },
    orderBy: { sourceOrder: "asc" },
    take: 200,
    include: {
      acceptedForms: true,
      senses: { where: { isPrimary: true }, take: 1 },
    },
  });

  const targetMeaning = normalizeAnswer(
    vocab.primaryMeaningZh ?? vocab.senses[0]?.meaningZh ?? "",
  );
  const meanings: string[] = [];
  const seen = new Set<string>([targetMeaning]);
  for (const row of rows) {
    if (sharesAcceptedForm(vocab, row)) continue;
    const meaning = row.senses[0]?.meaningZh;
    if (!meaning) continue;
    const normalized = normalizeAnswer(meaning);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    meanings.push(meaning);
    if (meanings.length === count) break;
  }
  return meanings;
}

async function getDistractorWritings(
  vocab: VocabularyDetail,
  count: number,
): Promise<string[]> {
  const excludeReadings = vocab.acceptedForms
    .filter((f) => f.formType === "READING")
    .map((f) => f.value);
  excludeReadings.push(vocab.primaryReading);
  const excludeWritings = vocab.acceptedForms
    .filter((f) => f.formType === "WRITING")
    .map((f) => f.value);
  excludeWritings.push(vocab.primaryWriting);

  const rows = await prisma.vocabularyEntry.findMany({
    where: {
      id: { not: vocab.id },
      isActive: true,
      level: vocab.level,
    },
    orderBy: { sourceOrder: "asc" },
    take: 200,
    include: { acceptedForms: true },
  });

  const targetWritingSet = new Set(excludeWritings.map(normalizeWriting));
  const targetReadingSet = new Set(excludeReadings.map(normalizeReading));
  const writings: string[] = [];
  const seen = new Set<string>(targetWritingSet);

  for (const row of rows) {
    const candidateWritings = row.acceptedForms
      .filter((form) => form.formType === "WRITING")
      .map((form) => form.value);
    candidateWritings.push(row.primaryWriting);
    const candidateReadings = row.acceptedForms
      .filter((form) => form.formType === "READING")
      .map((form) => form.value);
    candidateReadings.push(row.primaryReading);

    if (candidateWritings.some((value) => targetWritingSet.has(normalizeWriting(value)))) {
      continue;
    }
    if (candidateReadings.some((value) => targetReadingSet.has(normalizeReading(value)))) {
      continue;
    }

    const normalized = normalizeWriting(row.primaryWriting);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    writings.push(row.primaryWriting);
    if (writings.length === count) break;
  }

  return writings;
}

function sharesAcceptedForm(
  target: VocabularyDetail,
  candidate: {
    primaryWriting: string;
    primaryReading: string;
    acceptedForms: Array<{ formType: string; value: string }>;
  },
): boolean {
  const targetWritings = new Set(
    [
      target.primaryWriting,
      ...target.acceptedForms
        .filter((form) => form.formType === "WRITING")
        .map((form) => form.value),
    ].map(normalizeWriting),
  );
  const targetReadings = new Set(
    [
      target.primaryReading,
      ...target.acceptedForms
        .filter((form) => form.formType === "READING")
        .map((form) => form.value),
    ].map(normalizeReading),
  );

  return [
    candidate.primaryWriting,
    ...candidate.acceptedForms
      .filter((form) => form.formType === "WRITING")
      .map((form) => form.value),
  ].some((value) => targetWritings.has(normalizeWriting(value))) ||
    [
      candidate.primaryReading,
      ...candidate.acceptedForms
        .filter((form) => form.formType === "READING")
        .map((form) => form.value),
    ].some((value) => targetReadings.has(normalizeReading(value)));
}

function createChoiceOptions(
  correctText: string,
  distractors: string[],
): { options: QuestionOption[]; correctOptionId: string } {
  const entries = shuffle([
    { text: correctText, correct: true },
    ...distractors.map((text) => ({ text, correct: false })),
  ]);
  const options = entries.map((entry) => ({ id: randomUUID(), text: entry.text }));
  const correctIndex = entries.findIndex((entry) => entry.correct);
  return { options, correctOptionId: options[correctIndex].id };
}

function normalizeWriting(value: string): string {
  return normalizeAnswer(value);
}

function normalizeReading(value: string): string {
  return katakanaToHiragana(normalizeAnswer(value));
}

function shuffle<T>(arr: readonly T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

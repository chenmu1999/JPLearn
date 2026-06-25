/**
 * Stable enums and DTO types for the vocabulary module.
 *
 * SQLite/Prisma has no native enums, so these "enum" values are plain string
 * constants shared by the schema (as String columns), services, and UI. Display
 * text stays in components; internal logic only references these keys.
 */

export const VOCABULARY_STATUS = {
  NEW: "NEW",
  LEARNING: "LEARNING",
  REVIEWING: "REVIEWING",
  MASTERED: "MASTERED",
} as const;
export type VocabularyStatus = (typeof VOCABULARY_STATUS)[keyof typeof VOCABULARY_STATUS];
export const VOCABULARY_STATUS_VALUES: string[] = Object.values(VOCABULARY_STATUS);

export const FORM_TYPE = { READING: "READING", WRITING: "WRITING" } as const;
export type FormType = (typeof FORM_TYPE)[keyof typeof FORM_TYPE];

export const EXAMPLE_SOURCE_TYPE = {
  SOURCE: "SOURCE",
  CURATED: "CURATED",
  AI: "AI",
} as const;
export type ExampleSourceType = (typeof EXAMPLE_SOURCE_TYPE)[keyof typeof EXAMPLE_SOURCE_TYPE];

/** Per-word ability dimensions; values match VocabularyMastery score field stems. */
export const VOCABULARY_DIMENSION = {
  READING: "reading",
  SPELLING: "spelling",
  MEANING: "meaning",
  WRITING: "writing",
  CONTEXT: "context",
} as const;
export type VocabularyDimension =
  (typeof VOCABULARY_DIMENSION)[keyof typeof VOCABULARY_DIMENSION];

export const EXERCISE_TYPE = {
  WRITING_TO_READING_INPUT: "WRITING_TO_READING_INPUT",
  READING_TO_MEANING_CHOICE: "READING_TO_MEANING_CHOICE",
  MEANING_TO_WORD_CHOICE: "MEANING_TO_WORD_CHOICE",
  CONTEXT_WORD_CHOICE: "CONTEXT_WORD_CHOICE",
  READING_TO_WRITING_CHOICE: "READING_TO_WRITING_CHOICE",
  AUDIO_TO_READING_INPUT: "AUDIO_TO_READING_INPUT",
  INFLECTION_TO_LEMMA: "INFLECTION_TO_LEMMA",
  SENTENCE_WRITING: "SENTENCE_WRITING",
} as const;
export type ExerciseType = (typeof EXERCISE_TYPE)[keyof typeof EXERCISE_TYPE];

export const ERROR_TYPE = {
  READING_UNKNOWN: "READING_UNKNOWN",
  KANA_SPELLING: "KANA_SPELLING",
  DAKUON_HANDAKUON: "DAKUON_HANDAKUON",
  SMALL_KANA: "SMALL_KANA",
  SOKUON: "SOKUON",
  LONG_VOWEL: "LONG_VOWEL",
  MORAIC_N: "MORAIC_N",
  SCRIPT_CONFUSION: "SCRIPT_CONFUSION",
  MEANING_UNKNOWN: "MEANING_UNKNOWN",
  MEANING_CONFUSION: "MEANING_CONFUSION",
  WRITING_FORM: "WRITING_FORM",
  PART_OF_SPEECH: "PART_OF_SPEECH",
  CONTEXT_USAGE: "CONTEXT_USAGE",
  LEMMA_INFLECTION: "LEMMA_INFLECTION",
} as const;
export type ErrorType = (typeof ERROR_TYPE)[keyof typeof ERROR_TYPE];

export const SESSION_TYPE = {
  LEARN: "LEARN",
  REVIEW: "REVIEW",
  WRONG_BOOK: "WRONG_BOOK",
} as const;
export type SessionType = (typeof SESSION_TYPE)[keyof typeof SESSION_TYPE];

// --- Read DTOs (Batch 3) ---

export interface MasterySummary {
  status: VocabularyStatus;
  readingScore: number;
  spellingScore: number;
  meaningScore: number;
  writingScore: number;
  contextScore: number;
  reviewStage: number;
  nextReviewAt: string | null;
  masteredAt: string | null;
  isFavorite: boolean;
  isSuspended: boolean;
}

export interface VocabularyListItem {
  id: string;
  sourceKey: string;
  lemma: string;
  primaryWriting: string;
  primaryReading: string;
  partOfSpeech: string | null;
  category: string | null;
  level: string;
  primaryMeaningZh: string | null;
  mastery: MasterySummary;
}

export interface VocabularyListResponse {
  items: VocabularyListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface AcceptedFormDTO {
  formType: FormType;
  value: string;
  isPrimary: boolean;
}

export interface SenseDTO {
  meaningZh: string;
  order: number;
  isPrimary: boolean;
  noteZh: string | null;
}

/** Safe example fields only — never expose AI raw response or cost fields. */
export interface ExampleDTO {
  id: string;
  sourceType: ExampleSourceType;
  japanese: string;
  chinese: string | null;
  targetSurface: string | null;
  usageNoteZh: string | null;
  isDefault: boolean;
}

export interface AttemptSummary {
  total: number;
  lastIsCorrect: boolean | null;
  lastAt: string | null;
}

export interface VocabularyDetail extends VocabularyListItem {
  meaningEn: string | null;
  usageNoteZh: string | null;
  acceptedForms: AcceptedFormDTO[];
  senses: SenseDTO[];
  examples: ExampleDTO[];
  recentAttempts: AttemptSummary;
}

// --- Study plan / dashboard DTOs (Batch 4) ---

export interface StudyPlanDTO {
  id: string;
  level: string;
  dailyNewCount: number;
  timezone: string;
  isActive: boolean;
  startedAt: string;
  localDate: string;
}

export interface DashboardDTO {
  localDate: string;
  plan: { level: string; dailyNewCount: number; timezone: string };
  newToday: { total: number; remaining: number };
  reviewToday: { total: number; remaining: number };
  overdueReview: number;
  totals: { words: number; started: number; mastered: number };
  averages: { reading: number; spelling: number; meaning: number };
}

export interface LearnNextDTO {
  done: boolean;
  remaining: number;
  assignmentId: string | null;
  sessionItemId: string | null;
  card: VocabularyDetail | null;
  question: QuestionDTO | null;
}

// --- Objective quiz DTOs (Batch 5) ---

export interface QuestionPrompt {
  writing?: string;
  reading?: string;
  meaningZh?: string;
  context?: string;
}

export interface QuestionOption {
  id: string;
  text: string;
}

export interface QuestionDTO {
  questionId: string;
  exerciseType: ExerciseType;
  targetDimension: VocabularyDimension;
  prompt: QuestionPrompt;
  options: QuestionOption[] | null;
}

export interface SessionDTO {
  sessionId: string;
  sessionType: string;
  localDate: string;
  status: string;
  totalCount: number;
  pendingCount: number;
}

export interface AttemptResultDTO {
  attemptId: string;
  isCorrect: boolean;
  errorType: ErrorType | null;
  acceptedAnswer: string;
  scoreBefore: number;
  scoreAfter: number;
  remainingCount: number;
  sessionComplete: boolean;
  nextReviewAt: string | null;
}

export interface WrongVocabularyItem {
  vocabulary: VocabularyListItem;
  errorCount: number;
  lastErrorType: ErrorType | null;
  lastTargetDimension: VocabularyDimension;
  lastWrongAt: string;
}

export interface WrongVocabularyResponse {
  items: WrongVocabularyItem[];
  total: number;
  days: number;
  errorType: ErrorType | null;
  dimension: VocabularyDimension | null;
}

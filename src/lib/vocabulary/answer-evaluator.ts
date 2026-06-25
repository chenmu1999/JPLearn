/**
 * Evaluates a user's answer against server-stored accepted answers.
 * Pure logic — no DB. Wraps normalize-answer and classify-error.
 */

import { normalizeAnswer } from "@/lib/vocabulary/normalize-answer";
import { classifyError } from "@/lib/vocabulary/classify-error";
import { type ErrorType, type ExerciseType } from "@/lib/vocabulary/types";

export interface EvaluationResult {
  isCorrect: boolean;
  normalizedUserAnswer: string;
  /** The matched accepted answer (if correct) or first accepted answer (if wrong). */
  acceptedAnswer: string;
  errorType: ErrorType | null;
}

/**
 * Evaluate userAnswer against the list of acceptedAnswers.
 *
 * For choice questions: acceptedAnswers holds option IDs (e.g. "opt-correct"),
 * and userAnswer is the ID the user selected.
 *
 * For input questions: acceptedAnswers holds normalized text values and
 * userAnswer is the raw text the user typed.
 */
export function evaluateAnswer(
  userAnswer: string,
  acceptedAnswers: string[],
  exerciseType: ExerciseType,
): EvaluationResult {
  const normalized = normalizeAnswer(userAnswer);
  const normalizedAccepted = acceptedAnswers.map((a) => normalizeAnswer(a));

  const matchIdx = normalizedAccepted.findIndex((a) => a === normalized);

  if (matchIdx >= 0) {
    return {
      isCorrect: true,
      normalizedUserAnswer: normalized,
      acceptedAnswer: acceptedAnswers[matchIdx],
      errorType: null,
    };
  }

  const canonical = normalizedAccepted[0] ?? "";
  return {
    isCorrect: false,
    normalizedUserAnswer: normalized,
    acceptedAnswer: acceptedAnswers[0] ?? "",
    errorType: classifyError(normalized, canonical, exerciseType),
  };
}

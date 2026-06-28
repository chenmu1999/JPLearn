/**
 * Locked first-version rules and constants for the vocabulary module.
 * Centralised here (not scattered across components/routes) per
 * plan/单词模块详细执行计划.md §4. Safe to import from both server
 * and client code (no server-only dependencies).
 */

/** First version is single-user; this is the seeded UserProfile id. */
export const LOCAL_USER_ID = "local-user";

/** JLPT word books, ordered easiest → hardest (default/learning order). */
export const VOCABULARY_LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;
export type VocabularyLevel = (typeof VOCABULARY_LEVELS)[number];

/** List pagination caps (server enforces maxPageSize to block huge queries). */
export const PAGINATION = {
  minPage: 1,
  defaultPageSize: 20,
  maxPageSize: 50,
} as const;

/** Allowed list sort keys. */
export const VOCABULARY_SORTS = {
  ORDER: "order",
  LEMMA: "lemma",
  READING: "reading",
} as const;
export type VocabularySort = (typeof VOCABULARY_SORTS)[keyof typeof VOCABULARY_SORTS];
export const VOCABULARY_SORT_VALUES: string[] = Object.values(VOCABULARY_SORTS);

/** Daily new-word plan bounds (plan §4.1). Used from Batch 4 onward. */
export const DAILY_NEW = { min: 5, max: 50, default: 10 } as const;

/** Dimension score bounds and deltas (plan §4.2). Used from Batch 5 onward. */
export const SCORE_BOUNDS = { min: 0, max: 100 } as const;
export const SCORE_DELTAS = { correct: 20, correctWithHint: 5, wrong: -10 } as const;
export const MASTERY_THRESHOLD = 80;

/** Review stage intervals in minutes, stage 0..5 (plan §4.3). Used from Batch 6. */
export const REVIEW_INTERVALS_MINUTES = [10, 1_440, 4_320, 10_080, 20_160, 43_200] as const;
export const MAX_REVIEW_STAGE = REVIEW_INTERVALS_MINUTES.length - 1;

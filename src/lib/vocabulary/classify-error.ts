/**
 * Kana / spelling error classification for the vocabulary quiz engine (plan §11.4).
 * Pure functions — no DB, no side effects.
 *
 * Priority order matches the execution plan:
 * 1. Script confusion (same phoneme, different kana script)
 * 2. Dakuon / handakuon mismatch (voicing difference)
 * 3. Small kana vs large kana
 * 4. Sokuon (っ/ッ) missing or extra
 * 5. Long vowel (ー) missing or extra
 * 6. Moraic N (ん/ン) missing or extra
 * 7. Other kana spelling difference
 * 8. Choice questions always return MEANING_CONFUSION
 */

import { katakanaToHiragana } from "@/lib/vocabulary/normalize-answer";
import { ERROR_TYPE, type ErrorType, type ExerciseType } from "@/lib/vocabulary/types";

// --- Voicing tables ---

const HIRAGANA_VOICED: Record<string, string> = {
  が: "か", ぎ: "き", ぐ: "く", げ: "け", ご: "こ",
  ざ: "さ", じ: "し", ず: "す", ぜ: "せ", ぞ: "そ",
  だ: "た", ぢ: "ち", づ: "つ", で: "て", ど: "と",
  ば: "は", び: "ひ", ぶ: "ふ", べ: "へ", ぼ: "ほ",
  ぱ: "は", ぴ: "ひ", ぷ: "ふ", ぺ: "へ", ぽ: "ほ",
};

const KATAKANA_VOICED: Record<string, string> = {
  ガ: "カ", ギ: "キ", グ: "ク", ゲ: "ケ", ゴ: "コ",
  ザ: "サ", ジ: "シ", ズ: "ス", ゼ: "セ", ゾ: "ソ",
  ダ: "タ", ヂ: "チ", ヅ: "ツ", デ: "テ", ド: "ト",
  バ: "ハ", ビ: "ヒ", ブ: "フ", ベ: "ヘ", ボ: "ホ",
  パ: "ハ", ピ: "ヒ", プ: "フ", ペ: "ヘ", ポ: "ホ",
};

const ALL_VOICED = { ...HIRAGANA_VOICED, ...KATAKANA_VOICED };

// --- Small kana tables ---

const SMALL_TO_LARGE: Record<string, string> = {
  ぁ: "あ", ぃ: "い", ぅ: "う", ぇ: "え", ぉ: "お",
  っ: "つ", ゃ: "や", ゅ: "ゆ", ょ: "よ", ゎ: "わ",
  ァ: "ア", ィ: "イ", ゥ: "ウ", ェ: "エ", ォ: "オ",
  ッ: "ツ", ャ: "ヤ", ュ: "ユ", ョ: "ヨ", ヮ: "ワ",
};

const SOKUON = new Set(["っ", "ッ"]);
const MORAIC_N = new Set(["ん", "ン"]);

function stripVoicing(s: string): string {
  return [...s].map((c) => ALL_VOICED[c] ?? c).join("");
}

function enlargeKana(s: string): string {
  return [...s].map((c) => SMALL_TO_LARGE[c] ?? c).join("");
}

function removeChars(s: string, chars: Set<string>): string {
  return [...s].filter((c) => !chars.has(c)).join("");
}

const CHOICE_TYPES = new Set<ExerciseType>([
  "READING_TO_MEANING_CHOICE",
  "MEANING_TO_WORD_CHOICE",
  "CONTEXT_WORD_CHOICE",
]);

/**
 * Classifies the error type when userAnswer ≠ acceptedAnswer.
 * Caller must confirm answers differ before calling.
 * Returns null only when answers are identical (should not happen in practice).
 */
export function classifyError(
  userAnswer: string,
  acceptedAnswer: string,
  exerciseType: ExerciseType,
): ErrorType | null {
  if (userAnswer === acceptedAnswer) return null;

  // Choice questions: wrong selection = meaning/word confusion
  if (CHOICE_TYPES.has(exerciseType)) {
    return ERROR_TYPE.MEANING_CONFUSION;
  }

  // Normalise to hiragana for phoneme-level comparisons
  const userH = katakanaToHiragana(userAnswer);
  const acceptedH = katakanaToHiragana(acceptedAnswer);

  // 1. Script confusion: identical phonemes, different kana script
  if (userH === acceptedH) return ERROR_TYPE.SCRIPT_CONFUSION;

  // 2. Voicing: strip dakuten/handakuten and compare
  if (stripVoicing(userH) === stripVoicing(acceptedH)) {
    return ERROR_TYPE.DAKUON_HANDAKUON;
  }

  // 3. Small kana: enlarge small kana and compare
  if (enlargeKana(userH) === enlargeKana(acceptedH)) {
    return ERROR_TYPE.SMALL_KANA;
  }

  // 4. Sokuon (っ): remove and compare
  if (removeChars(userH, SOKUON) === removeChars(acceptedH, SOKUON)) {
    return ERROR_TYPE.SOKUON;
  }

  // 5. Long vowel (ー, and hiragana long-vowel written as repeated vowel)
  const stripLong = (s: string) => s.replace(/ー/g, "");
  if (stripLong(userH) === stripLong(acceptedH)) {
    return ERROR_TYPE.LONG_VOWEL;
  }

  // 6. Moraic N (ん/ン): remove and compare
  if (removeChars(userH, MORAIC_N) === removeChars(acceptedH, MORAIC_N)) {
    return ERROR_TYPE.MORAIC_N;
  }

  // 7. Any remaining kana spelling difference
  return ERROR_TYPE.KANA_SPELLING;
}

/**
 * Answer normalization for the vocabulary quiz engine (plan §11.3).
 * Pure functions — no DB, no side effects. Safe to import from both client and server.
 *
 * Rules applied:
 * - Unicode NFC normalization
 * - Strip leading/trailing whitespace
 * Does NOT perform script conversion or correct phonetic errors; those are
 * responsibility of the caller (see classify-error.ts).
 */

export function normalizeAnswer(raw: string): string {
  return raw.normalize("NFC").trim();
}

/** Convert full-width katakana → hiragana (same Unicode offset, U+30A1-U+30F6). */
export function katakanaToHiragana(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0x60),
  );
}

/** Convert hiragana → katakana (U+3041-U+3096). */
export function hiraganaToKatakana(s: string): string {
  return s.replace(/[ぁ-ゖ]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) + 0x60),
  );
}

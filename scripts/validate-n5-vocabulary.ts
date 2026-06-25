/**
 * Validate-only entry point for the N5 importer (Batch 2).
 *
 * Parses and validates data/vocabulary/jlpt/jlpt-vocabulary.csv and prints the
 * import report WITHOUT writing to the database. Exits non-zero if any row is
 * blocked (e.g. missing reading or meaning_zh, duplicate sourceKey).
 *
 *   tsx scripts/validate-n5-vocabulary.ts
 */
import { runImport } from "./import-n5-vocabulary";

runImport({ validate: true })
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error("Validation failed:", error);
    process.exit(1);
  });

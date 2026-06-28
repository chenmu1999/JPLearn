/**
 * N5 vocabulary importer (Batch 2).
 *
 * Reads the authoritative CSV (data/vocabulary/jlpt/jlpt-vocabulary.csv),
 * filters level=N5 (expected 718 rows), and idempotently upserts the base
 * vocabulary data per plan/数据库设计.md §4/§9:
 *   KnowledgePoint(kind=VOCABULARY) + VocabularyEntry
 *   + primary/secondary READING & WRITING VocabularyAcceptedForm
 *   + one primary VocabularySense.
 *
 * It does NOT pre-create VocabularyMastery, does NOT fabricate partOfSpeech /
 * category, and does NOT create default examples.
 *
 * Run modes:
 *   tsx scripts/import-n5-vocabulary.ts            # import (writes DB)
 *   tsx scripts/import-n5-vocabulary.ts --validate # dry run, report only
 *
 * Per the environment boundary, this is executed on the Ubuntu VM, never on
 * the Windows workspace.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const CSV_PATH = path.resolve(process.cwd(), "data/vocabulary/jlpt/jlpt-vocabulary.csv");
const TARGET_LEVEL = "N5";
const EXPECTED_N5_COUNT = 718;
const LOCAL_USER = { id: "local-user", displayName: "Local Learner", timezone: "Asia/Shanghai" };

const REQUIRED_COLUMNS = [
  "id",
  "level",
  "expression",
  "reading",
  "meaning_en",
  "meaning_zh",
  "tags",
  "source_guid",
  "source",
] as const;
type Column = (typeof REQUIRED_COLUMNS)[number];

// --- CSV parsing (RFC4180-ish: quoted fields, "" escapes, commas/newlines in quotes) ---
function parseCsv(input: string): string[][] {
  let content = input;
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1); // strip BOM
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    if (inQuotes) {
      if (c === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// --- Form cleaning ---
// parenthetical annotations e.g. "(する)", "(〜を)". Separate non-global regex for
// .test() to avoid the stateful lastIndex of a /g regex.
const ANNOTATION_TEST = /[(（][^)）]*[)）]/;
const ANNOTATION_RE = /[(（][^)）]*[)）]/g;
const hasAnnotation = (value: string) => ANNOTATION_TEST.test(value);
const cleanForm = (value: string) =>
  value.replace(ANNOTATION_RE, " ").replace(/\s+/g, " ").trim();

/** Split a multi-value form field on ; / ；, clean each token, dedupe, drop empties. */
function splitForms(raw: string): string[] {
  const out: string[] = [];
  for (const token of raw.split(/[;；]/)) {
    const cleaned = cleanForm(token);
    if (cleaned && !out.includes(cleaned)) out.push(cleaned);
  }
  return out;
}

const MEANING_SEPARATOR_RE = /[；;、]/;

interface ParsedRow {
  sourceKey: string;
  level: string;
  lemma: string;
  primaryWriting: string;
  primaryReading: string;
  writings: string[];
  readings: string[];
  meaningEn: string | null;
  meaningZh: string;
  sourceGuid: string | null;
  sourceName: string | null;
  sourceOrder: number;
  rawDataJson: string;
}

interface RowError {
  sourceKey: string;
  reason: string;
}

interface ParseResult {
  rows: ParsedRow[];
  errors: RowError[];
  stats: {
    totalN5: number;
    duplicateSourceKeys: string[];
    multiWriting: number;
    multiReading: number;
    multiMeaning: number;
    annotationsStripped: number;
  };
}

function loadAndValidate(): ParseResult {
  const content = readFileSync(CSV_PATH, "utf8");
  const table = parseCsv(content);
  if (table.length === 0) throw new Error("CSV is empty");

  const header = table[0];
  const colIndex = {} as Record<Column, number>;
  for (const name of REQUIRED_COLUMNS) {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`CSV is missing required column: ${name}`);
    colIndex[name] = i;
  }
  const get = (cells: string[], col: Column) => (cells[colIndex[col]] ?? "").trim();

  const rows: ParsedRow[] = [];
  const errors: RowError[] = [];
  const seen = new Set<string>();
  const duplicateSourceKeys: string[] = [];
  let totalN5 = 0;
  let multiWriting = 0;
  let multiReading = 0;
  let multiMeaning = 0;
  let annotationsStripped = 0;

  for (let r = 1; r < table.length; r++) {
    const cells = table[r];
    if (cells.length === 1 && cells[0] === "") continue; // blank line
    if (get(cells, "level") !== TARGET_LEVEL) continue;
    totalN5++;

    const sourceKey = get(cells, "id");
    const rawExpression = get(cells, "expression");
    const rawReading = get(cells, "reading");
    const meaningZh = get(cells, "meaning_zh");
    const meaningEn = get(cells, "meaning_en");
    const sourceGuid = get(cells, "source_guid");
    const sourceName = get(cells, "source");

    if (!sourceKey) {
      errors.push({ sourceKey: `row ${r + 1}`, reason: "missing id" });
      continue;
    }
    if (seen.has(sourceKey)) {
      duplicateSourceKeys.push(sourceKey);
      errors.push({ sourceKey, reason: "duplicate sourceKey" });
      continue;
    }
    seen.add(sourceKey);

    if (hasAnnotation(rawReading) || hasAnnotation(rawExpression)) annotationsStripped++;

    const writings = splitForms(rawExpression);
    const readings = splitForms(rawReading);

    if (readings.length === 0) {
      errors.push({ sourceKey, reason: "missing/empty reading (blocking)" });
      continue;
    }
    if (writings.length === 0) {
      errors.push({ sourceKey, reason: "missing/empty expression (blocking)" });
      continue;
    }
    if (!meaningZh) {
      errors.push({ sourceKey, reason: "missing meaning_zh (blocking)" });
      continue;
    }

    if (writings.length > 1) multiWriting++;
    if (readings.length > 1) multiReading++;
    if (MEANING_SEPARATOR_RE.test(meaningZh)) multiMeaning++;

    const orderMatch = sourceKey.match(/(\d+)\s*$/);
    const sourceOrder = orderMatch ? parseInt(orderMatch[1], 10) : totalN5;

    const rawObj: Record<string, string> = {};
    for (const name of REQUIRED_COLUMNS) rawObj[name] = cells[colIndex[name]] ?? "";

    rows.push({
      sourceKey,
      level: TARGET_LEVEL,
      lemma: writings[0],
      primaryWriting: writings[0],
      primaryReading: readings[0],
      writings,
      readings,
      meaningEn: meaningEn || null,
      meaningZh,
      sourceGuid: sourceGuid || null,
      sourceName: sourceName || null,
      sourceOrder,
      rawDataJson: JSON.stringify(rawObj),
    });
  }

  return {
    rows,
    errors,
    stats: {
      totalN5,
      duplicateSourceKeys,
      multiWriting,
      multiReading,
      multiMeaning,
      annotationsStripped,
    },
  };
}

async function writeRow(prisma: PrismaClient, row: ParsedRow): Promise<"added" | "updated"> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.vocabularyEntry.findUnique({
      where: { sourceKey: row.sourceKey },
      select: { id: true },
    });

    const kp = await tx.knowledgePoint.upsert({
      where: { sourceKey: row.sourceKey },
      create: {
        kind: "VOCABULARY",
        level: row.level,
        sourceName: row.sourceName,
        sourceKey: row.sourceKey,
        title: row.primaryWriting,
      },
      update: {
        kind: "VOCABULARY",
        level: row.level,
        sourceName: row.sourceName,
        title: row.primaryWriting,
      },
    });

    const entry = await tx.vocabularyEntry.upsert({
      where: { sourceKey: row.sourceKey },
      create: {
        knowledgePointId: kp.id,
        sourceKey: row.sourceKey,
        sourceGuid: row.sourceGuid,
        level: row.level,
        lemma: row.lemma,
        primaryWriting: row.primaryWriting,
        primaryReading: row.primaryReading,
        meaningEn: row.meaningEn,
        rawDataJson: row.rawDataJson,
        isActive: true,
        sourceOrder: row.sourceOrder,
      },
      update: {
        sourceGuid: row.sourceGuid,
        level: row.level,
        lemma: row.lemma,
        primaryWriting: row.primaryWriting,
        primaryReading: row.primaryReading,
        meaningEn: row.meaningEn,
        rawDataJson: row.rawDataJson,
        isActive: true,
        sourceOrder: row.sourceOrder,
      },
    });

    // Forms and the primary sense are fully derived from the source row, so we
    // replace them on every run to stay consistent with the CSV (no user data
    // is attached to these tables; user state lives elsewhere).
    await tx.vocabularyAcceptedForm.deleteMany({ where: { vocabularyId: entry.id } });
    await tx.vocabularySense.deleteMany({ where: { vocabularyId: entry.id } });

    for (let i = 0; i < row.writings.length; i++) {
      await tx.vocabularyAcceptedForm.create({
        data: {
          vocabularyId: entry.id,
          formType: "WRITING",
          value: row.writings[i],
          isPrimary: i === 0,
        },
      });
    }
    for (let i = 0; i < row.readings.length; i++) {
      await tx.vocabularyAcceptedForm.create({
        data: {
          vocabularyId: entry.id,
          formType: "READING",
          value: row.readings[i],
          isPrimary: i === 0,
        },
      });
    }
    await tx.vocabularySense.create({
      data: { vocabularyId: entry.id, meaningZh: row.meaningZh, order: 0, isPrimary: true },
    });

    return existing ? "updated" : "added";
  });
}

export async function runImport({ validate }: { validate: boolean }): Promise<number> {
  const mode = validate ? "VALIDATE (dry run, no DB writes)" : "IMPORT";
  console.log(`N5 vocabulary import — mode: ${mode}`);
  console.log(`Source: ${CSV_PATH}`);

  const { rows, errors, stats } = loadAndValidate();

  let added = 0;
  let updated = 0;

  if (!validate) {
    const prisma = new PrismaClient();
    try {
      await prisma.userProfile.upsert({
        where: { id: LOCAL_USER.id },
        update: { displayName: LOCAL_USER.displayName, timezone: LOCAL_USER.timezone },
        create: LOCAL_USER,
      });
      for (const row of rows) {
        const result = await writeRow(prisma, row);
        if (result === "added") added++;
        else updated++;
      }
    } finally {
      await prisma.$disconnect();
    }
  }

  console.log("\n=== Import report ===");
  console.log(`Total N5 source rows : ${stats.totalN5}`);
  console.log(`Valid (importable)   : ${rows.length}`);
  if (!validate) {
    console.log(`  - added            : ${added}`);
    console.log(`  - updated          : ${updated}`);
  } else {
    console.log(`  - would import     : ${rows.length}`);
  }
  console.log(`Skipped (errors)     : ${errors.length}`);
  console.log(`Missing reading/zh   : ${errors.filter((e) => e.reason.includes("blocking")).length}`);
  console.log(`Duplicate sourceKeys : ${stats.duplicateSourceKeys.length}`);
  console.log(`Multi-writing rows   : ${stats.multiWriting}`);
  console.log(`Multi-reading rows   : ${stats.multiReading}`);
  console.log(`Multi-meaning rows   : ${stats.multiMeaning}`);
  console.log(`Annotation-cleaned   : ${stats.annotationsStripped}`);

  if (stats.totalN5 !== EXPECTED_N5_COUNT) {
    console.warn(
      `\n[WARN] Expected ${EXPECTED_N5_COUNT} N5 rows but found ${stats.totalN5}. Confirm the data source.`,
    );
  }

  if (errors.length > 0) {
    console.error(`\n[ERROR] ${errors.length} row(s) blocked:`);
    for (const e of errors.slice(0, 50)) console.error(`  - ${e.sourceKey}: ${e.reason}`);
    if (errors.length > 50) console.error(`  ... and ${errors.length - 50} more`);
    return 1;
  }

  console.log("\nDone with no blocking errors.");
  return 0;
}

const isMain =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  const validate = process.argv.includes("--validate") || process.argv.includes("--dry-run");
  runImport({ validate })
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error("Import failed:", error);
      process.exit(1);
    });
}

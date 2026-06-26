/**
 * JLPT vocabulary importer (all levels N1–N5).
 *
 * Generalises scripts/import-n5-vocabulary.ts to any JLPT level. Reads the
 * authoritative CSV (data/vocabulary/jlpt/jlpt-vocabulary.csv) and idempotently
 * upserts base vocabulary data per plan/database-design.md §4/§9:
 *   KnowledgePoint(kind=VOCABULARY) + VocabularyEntry
 *   + primary/secondary READING & WRITING VocabularyAcceptedForm
 *   + one primary VocabularySense.
 *
 * It does NOT pre-create VocabularyMastery, fabricate partOfSpeech/category, or
 * create default examples. sourceOrder is the numeric suffix of the source id
 * and is unique per level (the schema's @@unique([level, sourceOrder])).
 *
 * Run modes (executed on the Ubuntu VM, never the Windows workspace):
 *   tsx scripts/import-jlpt-vocabulary.ts --all            # all levels
 *   tsx scripts/import-jlpt-vocabulary.ts --level=N3       # one level (repeatable)
 *   tsx scripts/import-jlpt-vocabulary.ts --all --validate # dry run, report only
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const CSV_PATH = path.resolve(process.cwd(), "data/vocabulary/jlpt/jlpt-vocabulary.csv");
const LOCAL_USER = { id: "local-user", displayName: "Local Learner", timezone: "Asia/Shanghai" };

const ALL_LEVELS = ["N1", "N2", "N3", "N4", "N5"] as const;
type Level = (typeof ALL_LEVELS)[number];

/** Expected row counts per level in the source CSV (used for a sanity warning). */
const EXPECTED_COUNTS: Record<Level, number> = {
  N1: 2699,
  N2: 1906,
  N3: 2140,
  N4: 668,
  N5: 718,
};

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
  perLevel: Record<string, number>;
}

function loadAndValidate(levels: Set<string>): ParseResult {
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
  const perLevel: Record<string, number> = {};
  // Stable per-level counter for sourceOrder fallback when an id has no numeric suffix.
  const levelSeq: Record<string, number> = {};

  for (let r = 1; r < table.length; r++) {
    const cells = table[r];
    if (cells.length === 1 && cells[0] === "") continue; // blank line
    const level = get(cells, "level");
    if (!levels.has(level)) continue;
    perLevel[level] = (perLevel[level] ?? 0) + 1;
    levelSeq[level] = (levelSeq[level] ?? 0) + 1;

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
      errors.push({ sourceKey, reason: "duplicate sourceKey" });
      continue;
    }
    seen.add(sourceKey);

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

    void hasAnnotation; // annotations are stripped silently by cleanForm

    const orderMatch = sourceKey.match(/(\d+)\s*$/);
    const sourceOrder = orderMatch ? parseInt(orderMatch[1], 10) : levelSeq[level];

    const rawObj: Record<string, string> = {};
    for (const name of REQUIRED_COLUMNS) rawObj[name] = cells[colIndex[name]] ?? "";

    rows.push({
      sourceKey,
      level,
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

  return { rows, errors, perLevel };
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

    // Forms and primary sense are fully derived from the source row, so replace
    // them on every run to stay consistent with the CSV (no user data here).
    await tx.vocabularyAcceptedForm.deleteMany({ where: { vocabularyId: entry.id } });
    await tx.vocabularySense.deleteMany({ where: { vocabularyId: entry.id } });

    for (let i = 0; i < row.writings.length; i++) {
      await tx.vocabularyAcceptedForm.create({
        data: { vocabularyId: entry.id, formType: "WRITING", value: row.writings[i], isPrimary: i === 0 },
      });
    }
    for (let i = 0; i < row.readings.length; i++) {
      await tx.vocabularyAcceptedForm.create({
        data: { vocabularyId: entry.id, formType: "READING", value: row.readings[i], isPrimary: i === 0 },
      });
    }
    await tx.vocabularySense.create({
      data: { vocabularyId: entry.id, meaningZh: row.meaningZh, order: 0, isPrimary: true },
    });

    return existing ? "updated" : "added";
  });
}

function parseLevelArgs(argv: string[]): Set<string> {
  if (argv.includes("--all")) return new Set(ALL_LEVELS);
  const levels = new Set<string>();
  for (const arg of argv) {
    const m = arg.match(/^--level=(N[1-5])$/);
    if (m) levels.add(m[1]);
  }
  return levels;
}

export async function runImport({
  levels,
  validate,
}: {
  levels: Set<string>;
  validate: boolean;
}): Promise<number> {
  const mode = validate ? "VALIDATE (dry run, no DB writes)" : "IMPORT";
  console.log(`JLPT vocabulary import — mode: ${mode}, levels: ${[...levels].sort().join(",")}`);
  console.log(`Source: ${CSV_PATH}`);

  const { rows, errors, perLevel } = loadAndValidate(levels);

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
  for (const level of ALL_LEVELS) {
    if (!levels.has(level)) continue;
    const found = perLevel[level] ?? 0;
    const expected = EXPECTED_COUNTS[level];
    const flag = found === expected ? "" : `  [WARN expected ${expected}]`;
    console.log(`  ${level}: ${found} source rows${flag}`);
  }
  console.log(`Valid (importable)   : ${rows.length}`);
  if (!validate) {
    console.log(`  - added            : ${added}`);
    console.log(`  - updated          : ${updated}`);
  }
  console.log(`Skipped (errors)     : ${errors.length}`);

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
  const levels = parseLevelArgs(process.argv);
  if (levels.size === 0) {
    console.error("No levels selected. Pass --all or --level=N3 (repeatable).");
    process.exit(2);
  }
  const validate = process.argv.includes("--validate") || process.argv.includes("--dry-run");
  runImport({ levels, validate })
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error("Import failed:", error);
      process.exit(1);
    });
}

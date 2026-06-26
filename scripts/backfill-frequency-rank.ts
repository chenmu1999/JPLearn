/**
 * Backfill VocabularyEntry.frequencyRank from a corpus frequency list.
 *
 * Source list: data/vocabulary/frequency/leeds-japanese-44998.txt
 *   (hingston/japanese, University of Leeds internet-Japanese frequency data —
 *    one word per line, descending frequency, line number = rank).
 *
 * The new-word learning order then becomes "common words first" instead of the
 * raw gojūon source order, which clustered look-alike / same-theme words
 * (e.g. 青/青い/赤/赤い). See src/lib/vocabulary/study-plan-service.ts.
 *
 * Matching strategy (validated against the 718 N5 entries, ~96% coverage):
 *   1. Match by writing form (primaryWriting, then lemma if different).
 *   2. Only fall back to the kana reading for words written *in kana* — matching
 *      a kanji word by reading collides with high-frequency particles
 *      (二→に, 歯→は, 手→て) and wrongly inflates its rank.
 *   3. Secondary attempt with honorific お/ご and the ～ counter placeholder
 *      stripped (お酒→酒, ～円→円).
 * Unmatched entries are reset to frequencyRank = null and fall back to
 * sourceOrder at the tail.
 *
 * Run on the Ubuntu VM (never the Windows workspace):
 *   tsx scripts/backfill-frequency-rank.ts            # write DB
 *   tsx scripts/backfill-frequency-rank.ts --dry-run  # report only
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const FREQ_PATH = path.resolve(
  process.cwd(),
  "data/vocabulary/frequency/leeds-japanese-44998.txt",
);

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");

const hasKanji = (s: string | null | undefined): boolean => /[一-龯]/.test(s ?? "");
const stripDecorations = (s: string | null | undefined): string =>
  (s ?? "").replace(/^[おご]/, "").replace(/[～~]/g, "");

function buildRankMap(): Map<string, number> {
  const lines = readFileSync(FREQ_PATH, "utf8").split("\n");
  const rank = new Map<string, number>();
  let r = 0;
  for (const line of lines) {
    const word = line.trim();
    if (!word) continue;
    r += 1;
    // Keep the first (best) rank for any surface form.
    if (!rank.has(word)) rank.set(word, r);
  }
  return rank;
}

function lookupRank(
  rank: Map<string, number>,
  entry: { lemma: string; primaryWriting: string; primaryReading: string },
): number | null {
  const candidates: string[] = [];
  if (entry.primaryWriting) candidates.push(entry.primaryWriting);
  if (entry.lemma && entry.lemma !== entry.primaryWriting) candidates.push(entry.lemma);
  // Reading only counts for kana-written words (avoid particle collisions).
  if (!hasKanji(entry.primaryWriting)) candidates.push(entry.primaryReading);
  // Stripped honorific / counter forms as a fallback.
  candidates.push(stripDecorations(entry.primaryWriting), stripDecorations(entry.lemma));

  let best = Number.POSITIVE_INFINITY;
  for (const c of candidates) {
    const rk = c ? rank.get(c) : undefined;
    if (rk && rk < best) best = rk;
  }
  return Number.isFinite(best) ? best : null;
}

async function main() {
  const rank = buildRankMap();
  console.log(`Loaded frequency list: ${rank.size} unique surface forms.`);

  const entries = await prisma.vocabularyEntry.findMany({
    select: {
      id: true,
      lemma: true,
      primaryWriting: true,
      primaryReading: true,
      sourceOrder: true,
    },
    orderBy: { sourceOrder: "asc" },
  });

  let matched = 0;
  const updates: { id: string; frequencyRank: number | null }[] = [];
  for (const e of entries) {
    const rk = lookupRank(rank, e);
    if (rk !== null) matched += 1;
    updates.push({ id: e.id, frequencyRank: rk });
  }

  const coverage = ((100 * matched) / entries.length).toFixed(1);
  console.log(`Matched ${matched}/${entries.length} (${coverage}%).`);

  if (dryRun) {
    const preview = updates
      .filter((u) => u.frequencyRank !== null)
      .sort((a, b) => (a.frequencyRank ?? 0) - (b.frequencyRank ?? 0))
      .slice(0, 15);
    const byId = new Map(entries.map((e) => [e.id, e]));
    console.log("\nTop 15 N5 words by frequency (would be learned first):");
    for (const u of preview) {
      const e = byId.get(u.id)!;
      console.log(
        `  rank ${String(u.frequencyRank).padStart(5)}  ${(e.primaryWriting || e.lemma).padEnd(8)} ${e.primaryReading}`,
      );
    }
    console.log("\nDry run — no writes.");
    return;
  }

  for (const u of updates) {
    await prisma.vocabularyEntry.update({
      where: { id: u.id },
      data: { frequencyRank: u.frequencyRank },
    });
  }
  console.log(`Updated frequencyRank for ${updates.length} entries.`);
}

main()
  .catch((error) => {
    console.error("Backfill failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

/**
 * Acceptance check for the N5 importer (Batch 2).
 *
 * Loads data/fixtures/vocabulary-acceptance.json and asserts that each of the
 * 20 representative entries was imported with the correct lemma, primary forms,
 * accepted reading/writing splitting, and primary Chinese meaning. Run AFTER
 * `pnpm db:import:n5`.
 *
 *   tsx scripts/check-n5-acceptance.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

interface Sample {
  sourceKey: string;
  lemma: string;
  primaryWriting: string;
  primaryReading: string;
  acceptedWritings: string[];
  acceptedReadings: string[];
  meaningZhContains: string;
  covers: string[];
}

const FIXTURE_PATH = path.resolve(process.cwd(), "data/fixtures/vocabulary-acceptance.json");

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");

async function main(): Promise<number> {
  const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as { samples: Sample[] };
  const prisma = new PrismaClient();
  const failures: string[] = [];

  try {
    for (const s of fixture.samples) {
      const entry = await prisma.vocabularyEntry.findUnique({
        where: { sourceKey: s.sourceKey },
        include: { acceptedForms: true, senses: true },
      });
      if (!entry) {
        failures.push(`${s.sourceKey}: not found in DB`);
        continue;
      }

      const problems: string[] = [];
      if (entry.lemma !== s.lemma) problems.push(`lemma=${entry.lemma}≠${s.lemma}`);
      if (entry.primaryWriting !== s.primaryWriting)
        problems.push(`primaryWriting=${entry.primaryWriting}≠${s.primaryWriting}`);
      if (entry.primaryReading !== s.primaryReading)
        problems.push(`primaryReading=${entry.primaryReading}≠${s.primaryReading}`);

      const readings = entry.acceptedForms
        .filter((f) => f.formType === "READING")
        .map((f) => f.value);
      const writings = entry.acceptedForms
        .filter((f) => f.formType === "WRITING")
        .map((f) => f.value);
      if (!sameSet(readings, s.acceptedReadings))
        problems.push(`readings=[${readings}]≠[${s.acceptedReadings}]`);
      if (!sameSet(writings, s.acceptedWritings))
        problems.push(`writings=[${writings}]≠[${s.acceptedWritings}]`);

      const primarySense = entry.senses.find((x) => x.isPrimary);
      if (!primarySense) problems.push("no primary sense");
      else if (!primarySense.meaningZh.includes(s.meaningZhContains))
        problems.push(`meaning "${primarySense.meaningZh}" missing "${s.meaningZhContains}"`);

      if (problems.length > 0) failures.push(`${s.sourceKey}: ${problems.join("; ")}`);
    }
  } finally {
    await prisma.$disconnect();
  }

  const total = fixture.samples.length;
  if (failures.length > 0) {
    console.error(`Acceptance check FAILED (${failures.length}/${total}):`);
    for (const f of failures) console.error(`  - ${f}`);
    return 1;
  }
  console.log(`Acceptance check PASSED: all ${total} representative N5 samples match.`);
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error("Acceptance check errored:", error);
    process.exit(1);
  });

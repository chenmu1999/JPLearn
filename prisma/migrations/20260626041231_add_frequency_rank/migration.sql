-- AlterTable
ALTER TABLE "VocabularyEntry" ADD COLUMN "frequencyRank" INTEGER;

-- CreateIndex
CREATE INDEX "VocabularyEntry_level_frequencyRank_idx" ON "VocabularyEntry"("level", "frequencyRank");

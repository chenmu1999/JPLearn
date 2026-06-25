import "server-only";

import { prisma } from "@/lib/db/client";
import {
  VOCABULARY_STATUS,
  type ErrorType,
  type VocabularyDimension,
  type VocabularyStatus,
  type WrongVocabularyResponse,
} from "@/lib/vocabulary/types";

export interface WrongBookFilters {
  days: 7 | 30;
  errorType?: ErrorType;
  dimension?: VocabularyDimension;
}

export async function listWrongVocabulary(
  userId: string,
  filters: WrongBookFilters,
): Promise<WrongVocabularyResponse> {
  const since = new Date(Date.now() - filters.days * 24 * 60 * 60 * 1_000);
  const attempts = await prisma.vocabularyAttempt.findMany({
    where: {
      userId,
      isCorrect: false,
      createdAt: { gte: since },
      ...(filters.errorType ? { errorType: filters.errorType } : {}),
      ...(filters.dimension ? { targetDimension: filters.dimension } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: {
      vocabularyId: true,
      errorType: true,
      targetDimension: true,
      createdAt: true,
    },
  });

  const grouped = new Map<
    string,
    {
      errorCount: number;
      lastErrorType: ErrorType | null;
      lastTargetDimension: VocabularyDimension;
      lastWrongAt: Date;
    }
  >();
  for (const attempt of attempts) {
    const existing = grouped.get(attempt.vocabularyId);
    if (existing) {
      existing.errorCount += 1;
      continue;
    }
    grouped.set(attempt.vocabularyId, {
      errorCount: 1,
      lastErrorType: attempt.errorType as ErrorType | null,
      lastTargetDimension: attempt.targetDimension as VocabularyDimension,
      lastWrongAt: attempt.createdAt,
    });
  }

  const vocabularyIds = [...grouped.keys()];
  const entries = await prisma.vocabularyEntry.findMany({
    where: { id: { in: vocabularyIds }, isActive: true },
    include: {
      senses: { where: { isPrimary: true }, take: 1 },
      masteries: { where: { userId }, take: 1 },
    },
  });
  const entryMap = new Map(entries.map((entry) => [entry.id, entry]));

  const items = vocabularyIds.flatMap((vocabularyId) => {
    const entry = entryMap.get(vocabularyId);
    const wrong = grouped.get(vocabularyId);
    if (!entry || !wrong) return [];
    const mastery = entry.masteries[0];
    return [{
      vocabulary: {
        id: entry.id,
        sourceKey: entry.sourceKey,
        lemma: entry.lemma,
        primaryWriting: entry.primaryWriting,
        primaryReading: entry.primaryReading,
        partOfSpeech: entry.partOfSpeech,
        category: entry.category,
        level: entry.level,
        primaryMeaningZh: entry.senses[0]?.meaningZh ?? null,
        mastery: {
          status: (mastery?.status ?? VOCABULARY_STATUS.NEW) as VocabularyStatus,
          readingScore: mastery?.readingScore ?? 0,
          spellingScore: mastery?.spellingScore ?? 0,
          meaningScore: mastery?.meaningScore ?? 0,
          writingScore: mastery?.writingScore ?? 0,
          contextScore: mastery?.contextScore ?? 0,
          reviewStage: mastery?.reviewStage ?? 0,
          nextReviewAt: mastery?.nextReviewAt?.toISOString() ?? null,
          masteredAt: mastery?.masteredAt?.toISOString() ?? null,
          isFavorite: mastery?.isFavorite ?? false,
          isSuspended: mastery?.isSuspended ?? false,
        },
      },
      errorCount: wrong.errorCount,
      lastErrorType: wrong.lastErrorType,
      lastTargetDimension: wrong.lastTargetDimension,
      lastWrongAt: wrong.lastWrongAt.toISOString(),
    }];
  });

  return {
    items,
    total: items.length,
    days: filters.days,
    errorType: filters.errorType ?? null,
    dimension: filters.dimension ?? null,
  };
}

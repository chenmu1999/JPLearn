import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/client";
import { PAGINATION, VOCABULARY_SORTS, type VocabularySort } from "@/lib/vocabulary/config";
import {
  EXAMPLE_SOURCE_TYPE,
  VOCABULARY_STATUS,
  type AcceptedFormDTO,
  type ExampleDTO,
  type ExampleSourceType,
  type FormType,
  type MasterySummary,
  type SenseDTO,
  type VocabularyDetail,
  type VocabularyListItem,
  type VocabularyListResponse,
  type VocabularyStatus,
} from "@/lib/vocabulary/types";

export interface ListVocabularyParams {
  page: number;
  pageSize: number;
  q?: string;
  status?: VocabularyStatus;
  partOfSpeech?: string;
  category?: string;
  level?: string;
  sort?: VocabularySort;
}

const DEFAULT_MASTERY: MasterySummary = {
  status: VOCABULARY_STATUS.NEW,
  readingScore: 0,
  spellingScore: 0,
  meaningScore: 0,
  writingScore: 0,
  contextScore: 0,
  reviewStage: 0,
  nextReviewAt: null,
  masteredAt: null,
  isFavorite: false,
  isSuspended: false,
};

type MasteryRow = {
  status: string;
  readingScore: number;
  spellingScore: number;
  meaningScore: number;
  writingScore: number;
  contextScore: number;
  reviewStage: number;
  nextReviewAt: Date | null;
  masteredAt: Date | null;
  isFavorite: boolean;
  isSuspended: boolean;
};

function toMasterySummary(row: MasteryRow | undefined): MasterySummary {
  if (!row) return { ...DEFAULT_MASTERY };
  return {
    status: row.status as VocabularyStatus,
    readingScore: row.readingScore,
    spellingScore: row.spellingScore,
    meaningScore: row.meaningScore,
    writingScore: row.writingScore,
    contextScore: row.contextScore,
    reviewStage: row.reviewStage,
    nextReviewAt: row.nextReviewAt ? row.nextReviewAt.toISOString() : null,
    masteredAt: row.masteredAt ? row.masteredAt.toISOString() : null,
    isFavorite: row.isFavorite,
    isSuspended: row.isSuspended,
  };
}

function buildWhere(params: ListVocabularyParams, userId: string): Prisma.VocabularyEntryWhereInput {
  const and: Prisma.VocabularyEntryWhereInput[] = [{ isActive: true }];

  if (params.level) and.push({ level: params.level });
  if (params.partOfSpeech) and.push({ partOfSpeech: params.partOfSpeech });
  if (params.category) and.push({ category: params.category });

  if (params.q) {
    const q = params.q;
    and.push({
      OR: [
        { lemma: { contains: q } },
        { primaryWriting: { contains: q } },
        { primaryReading: { contains: q } },
        { senses: { some: { meaningZh: { contains: q } } } },
        { acceptedForms: { some: { value: { contains: q } } } },
      ],
    });
  }

  // status lives on the per-user VocabularyMastery; entries without a mastery
  // row default to NEW, so NEW must also match "no mastery for this user".
  if (params.status === VOCABULARY_STATUS.NEW) {
    and.push({
      OR: [
        { masteries: { none: { userId } } },
        { masteries: { some: { userId, status: VOCABULARY_STATUS.NEW } } },
      ],
    });
  } else if (params.status) {
    and.push({ masteries: { some: { userId, status: params.status } } });
  }

  return { AND: and };
}

function buildOrderBy(
  sort: VocabularySort | undefined,
): Prisma.VocabularyEntryOrderByWithRelationInput | Prisma.VocabularyEntryOrderByWithRelationInput[] {
  switch (sort) {
    case VOCABULARY_SORTS.LEMMA:
      return { lemma: "asc" };
    case VOCABULARY_SORTS.READING:
      return { primaryReading: "asc" };
    default:
      return [{ level: "asc" }, { sourceOrder: "asc" }];
  }
}

export async function listVocabulary(
  params: ListVocabularyParams,
  userId: string,
): Promise<VocabularyListResponse> {
  const page = Math.max(PAGINATION.minPage, params.page);
  const pageSize = Math.min(Math.max(1, params.pageSize), PAGINATION.maxPageSize);
  const where = buildWhere(params, userId);

  const [total, rows] = await prisma.$transaction([
    prisma.vocabularyEntry.count({ where }),
    prisma.vocabularyEntry.findMany({
      where,
      orderBy: buildOrderBy(params.sort),
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        senses: { where: { isPrimary: true }, take: 1 },
        masteries: { where: { userId }, take: 1 },
      },
    }),
  ]);

  const items: VocabularyListItem[] = rows.map((row) => ({
    id: row.id,
    sourceKey: row.sourceKey,
    lemma: row.lemma,
    primaryWriting: row.primaryWriting,
    primaryReading: row.primaryReading,
    partOfSpeech: row.partOfSpeech,
    category: row.category,
    level: row.level,
    primaryMeaningZh: row.senses[0]?.meaningZh ?? null,
    mastery: toMasterySummary(row.masteries[0]),
  }));

  return {
    items,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getVocabularyDetail(
  idOrSourceKey: string,
  userId: string,
): Promise<VocabularyDetail | null> {
  const entry = await prisma.vocabularyEntry.findFirst({
    where: { OR: [{ id: idOrSourceKey }, { sourceKey: idOrSourceKey }] },
    include: {
      acceptedForms: { orderBy: [{ formType: "asc" }, { isPrimary: "desc" }, { value: "asc" }] },
      senses: { orderBy: { order: "asc" } },
      examples: {
        where: {
          status: "ACTIVE",
          sourceType: { in: [EXAMPLE_SOURCE_TYPE.SOURCE, EXAMPLE_SOURCE_TYPE.CURATED] },
        },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      },
      masteries: { where: { userId }, take: 1 },
    },
  });

  if (!entry) return null;

  const [attemptCount, lastAttempt] = await prisma.$transaction([
    prisma.vocabularyAttempt.count({ where: { userId, vocabularyId: entry.id } }),
    prisma.vocabularyAttempt.findFirst({
      where: { userId, vocabularyId: entry.id },
      orderBy: { createdAt: "desc" },
      select: { isCorrect: true, createdAt: true },
    }),
  ]);

  const acceptedForms: AcceptedFormDTO[] = entry.acceptedForms.map((f) => ({
    formType: f.formType as FormType,
    value: f.value,
    isPrimary: f.isPrimary,
  }));

  const senses: SenseDTO[] = entry.senses.map((s) => ({
    meaningZh: s.meaningZh,
    order: s.order,
    isPrimary: s.isPrimary,
    noteZh: s.noteZh,
  }));

  const examples: ExampleDTO[] = entry.examples.map((e) => ({
    id: e.id,
    sourceType: e.sourceType as ExampleSourceType,
    japanese: e.japanese,
    chinese: e.chinese,
    targetSurface: e.targetSurface,
    usageNoteZh: e.usageNoteZh,
    isDefault: e.isDefault,
  }));

  return {
    id: entry.id,
    sourceKey: entry.sourceKey,
    lemma: entry.lemma,
    primaryWriting: entry.primaryWriting,
    primaryReading: entry.primaryReading,
    partOfSpeech: entry.partOfSpeech,
    category: entry.category,
    level: entry.level,
    primaryMeaningZh: senses.find((s) => s.isPrimary)?.meaningZh ?? senses[0]?.meaningZh ?? null,
    mastery: toMasterySummary(entry.masteries[0]),
    meaningEn: entry.meaningEn,
    usageNoteZh: entry.usageNoteZh,
    acceptedForms,
    senses,
    examples,
    recentAttempts: {
      total: attemptCount,
      lastIsCorrect: lastAttempt ? lastAttempt.isCorrect : null,
      lastAt: lastAttempt ? lastAttempt.createdAt.toISOString() : null,
    },
  };
}

import "server-only";

import { prisma } from "@/lib/db/client";
import { DAILY_NEW, VOCABULARY_LEVELS } from "@/lib/vocabulary/config";
import { getVocabularyDetail } from "@/lib/vocabulary/vocabulary-repository";
import {
  VOCABULARY_STATUS,
  type DashboardDTO,
  type LearnNextDTO,
  type PlanDTO,
  type PlanStatus,
  type PlanTimeMode,
  type StudyPlanDTO,
} from "@/lib/vocabulary/types";

const DEFAULT_TIMEZONE = "Asia/Shanghai";
const DEFAULT_LEVEL = VOCABULARY_LEVELS[0];
const ASSIGNMENT_NEW = "NEW";
const ASSIGNMENT_REVIEW = "REVIEW";
const ACTIVE_STATUSES = [
  VOCABULARY_STATUS.LEARNING,
  VOCABULARY_STATUS.REVIEWING,
  VOCABULARY_STATUS.MASTERED,
];

// --- Timezone helpers ---

/** Local calendar date (YYYY-MM-DD) for an instant in the given IANA timezone. */
export function localDateString(date: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function tzOffsetMs(timeZone: string, date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const hour = map.hour === "24" ? 0 : Number(map.hour);
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    hour,
    Number(map.minute),
    Number(map.second),
  );
  return asUtc - date.getTime();
}

/** UTC instant of local midnight for a YYYY-MM-DD date in the given timezone. */
export function startOfLocalDayUtc(localDate: string, timeZone: string): Date {
  const guess = new Date(`${localDate}T00:00:00Z`);
  const offset = tzOffsetMs(timeZone, guess);
  return new Date(guess.getTime() - offset);
}

function clampDailyNew(value: number): number {
  return Math.min(DAILY_NEW.max, Math.max(DAILY_NEW.min, Math.round(value)));
}

/** Inclusive day count between two YYYY-MM-DD local dates (>= 1). */
function daysInclusive(fromLocalDate: string, toLocalDate: string): number {
  const from = Date.parse(`${fromLocalDate}T00:00:00Z`);
  const to = Date.parse(`${toLocalDate}T00:00:00Z`);
  return Math.max(1, Math.round((to - from) / 86_400_000) + 1);
}

/** Add `days` to a YYYY-MM-DD date, returning YYYY-MM-DD. */
function addDaysLocal(localDate: string, days: number): string {
  const t = Date.parse(`${localDate}T00:00:00Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

// --- Plan CRUD ---

type PlanRow = {
  id: string;
  userId: string;
  name: string | null;
  level: string;
  dailyNewCount: number;
  totalWords: number;
  timezone: string;
  isActive: boolean;
  status: string;
  startedAt: Date;
  targetCompletedAt: Date | null;
};

/** Active level word-book size (denominator for plans/progress). */
async function countLevelWords(level: string): Promise<number> {
  return prisma.vocabularyEntry.count({ where: { isActive: true, level } });
}

/**
 * The current active plan, or a freshly-created default one. Kept for the
 * legacy single-plan dashboard/session paths; multi-plan callers pass a planId.
 */
export async function ensureActivePlan(userId: string): Promise<PlanRow> {
  const existing = await prisma.vocabularyStudyPlan.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;

  const total = await countLevelWords(DEFAULT_LEVEL);
  return prisma.vocabularyStudyPlan.create({
    data: {
      userId,
      level: DEFAULT_LEVEL,
      dailyNewCount: DAILY_NEW.default,
      totalWords: total,
      timezone: DEFAULT_TIMEZONE,
      isActive: true,
      status: "ACTIVE",
    },
  });
}

export async function getPlanRow(userId: string, planId: string): Promise<PlanRow | null> {
  const plan = await prisma.vocabularyStudyPlan.findUnique({ where: { id: planId } });
  if (!plan || plan.userId !== userId) return null;
  return plan;
}

/**
 * Resolve a plan for a learning/session flow: the given plan if a valid planId
 * is passed and owned by the user, otherwise the user's current active plan.
 */
export async function resolvePlan(userId: string, planId?: string | null): Promise<PlanRow> {
  if (planId) {
    const plan = await getPlanRow(userId, planId);
    if (plan) return plan;
  }
  return ensureActivePlan(userId);
}

export interface CreatePlanInput {
  level: string;
  mode: PlanTimeMode;
  /** BY_END_DATE: target end date (YYYY-MM-DD). BY_DAILY: words per day. */
  endDate?: string;
  dailyCount?: number;
  name?: string;
  timezone?: string;
}

export async function createPlan(userId: string, input: CreatePlanInput): Promise<PlanDTO> {
  const level = input.level;
  const timezone = input.timezone || DEFAULT_TIMEZONE;
  const total = await countLevelWords(level);
  const today = localDateString(new Date(), timezone);

  let dailyNewCount: number;
  let endLocalDate: string;

  if (input.mode === "BY_DAILY") {
    dailyNewCount = Math.max(1, Math.min(500, Math.round(input.dailyCount ?? DAILY_NEW.default)));
    const days = Math.max(1, Math.ceil(total / dailyNewCount));
    endLocalDate = addDaysLocal(today, days - 1);
  } else {
    endLocalDate = input.endDate && input.endDate >= today ? input.endDate : today;
    const days = daysInclusive(today, endLocalDate);
    dailyNewCount = Math.max(1, Math.ceil(total / days));
  }

  const plan = await prisma.vocabularyStudyPlan.create({
    data: {
      userId,
      name: input.name?.trim() || `${level} 计划`,
      level,
      dailyNewCount,
      totalWords: total,
      timezone,
      isActive: true,
      status: "ACTIVE",
      startedAt: startOfLocalDayUtc(today, timezone),
      targetCompletedAt: startOfLocalDayUtc(endLocalDate, timezone),
    },
  });
  return buildPlanDTO(plan);
}

export async function listPlanDTOs(userId: string): Promise<PlanDTO[]> {
  const plans = await prisma.vocabularyStudyPlan.findMany({
    where: { userId, status: { not: "ARCHIVED" } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
  return Promise.all(plans.map((p) => buildPlanDTO(p)));
}

export async function getPlanDTOById(userId: string, planId: string): Promise<PlanDTO | null> {
  const plan = await getPlanRow(userId, planId);
  return plan ? buildPlanDTO(plan) : null;
}

export async function updatePlanById(
  userId: string,
  planId: string,
  input: { name?: string; endDate?: string; dailyCount?: number; status?: PlanStatus },
): Promise<PlanDTO | null> {
  const plan = await getPlanRow(userId, planId);
  if (!plan) return null;

  const data: Record<string, unknown> = {};
  if (typeof input.name === "string") data.name = input.name.trim() || null;
  if (input.status) {
    data.status = input.status;
    data.isActive = input.status === "ACTIVE";
  }

  const today = localDateString(new Date(), plan.timezone);
  if (input.endDate && input.endDate >= today) {
    const days = daysInclusive(today, input.endDate);
    const remaining = await countRemainingNewWords(plan.id, plan.level);
    data.targetCompletedAt = startOfLocalDayUtc(input.endDate, plan.timezone);
    data.dailyNewCount = Math.max(1, Math.ceil(remaining / days));
  } else if (typeof input.dailyCount === "number") {
    const daily = Math.max(1, Math.min(500, Math.round(input.dailyCount)));
    const remaining = await countRemainingNewWords(plan.id, plan.level);
    const days = Math.max(1, Math.ceil(remaining / daily));
    data.dailyNewCount = daily;
    data.targetCompletedAt = startOfLocalDayUtc(addDaysLocal(today, days - 1), plan.timezone);
  }

  const updated = await prisma.vocabularyStudyPlan.update({ where: { id: plan.id }, data });
  return buildPlanDTO(updated);
}

export async function archivePlan(userId: string, planId: string): Promise<boolean> {
  const plan = await getPlanRow(userId, planId);
  if (!plan) return false;
  await prisma.vocabularyStudyPlan.update({
    where: { id: plan.id },
    data: { status: "ARCHIVED", isActive: false },
  });
  return true;
}

/** Words in the plan's level not yet introduced (no NEW assignment for this plan). */
async function countRemainingNewWords(planId: string, level: string): Promise<number> {
  return prisma.vocabularyEntry.count({
    where: {
      isActive: true,
      level,
      dailyAssignments: { none: { planId, assignmentType: ASSIGNMENT_NEW } },
    },
  });
}

/**
 * Adaptive new-word target for today: spread the words still to introduce evenly
 * across the days remaining until the plan's end date. Self-corrects for missed
 * days (fewer days left → larger daily target). Falls back to the stored pace
 * when there is no end date.
 */
async function computeTodayNewTarget(plan: PlanRow, localDate: string): Promise<number> {
  const remaining = await countRemainingNewWords(plan.id, plan.level);
  if (remaining <= 0) return 0;
  if (!plan.targetCompletedAt) return Math.min(plan.dailyNewCount, remaining);

  const endLocal = localDateString(plan.targetCompletedAt, plan.timezone);
  const daysLeft = endLocal <= localDate ? 1 : daysInclusive(localDate, endLocal);
  return Math.min(remaining, Math.max(1, Math.ceil(remaining / daysLeft)));
}

async function buildPlanDTO(plan: PlanRow): Promise<PlanDTO> {
  const localDate = localDateString(new Date(), plan.timezone);
  const startLocal = localDateString(plan.startedAt, plan.timezone);
  const endLocal = plan.targetCompletedAt
    ? localDateString(plan.targetCompletedAt, plan.timezone)
    : null;

  const [introduced, mastered, todayTarget] = await Promise.all([
    prisma.vocabularyDailyAssignment
      .findMany({
        where: { planId: plan.id, assignmentType: ASSIGNMENT_NEW },
        distinct: ["vocabularyId"],
        select: { vocabularyId: true },
      })
      .then((rows) => rows.length),
    prisma.vocabularyMastery.count({
      where: { userId: plan.userId, status: VOCABULARY_STATUS.MASTERED, vocabulary: { level: plan.level } },
    }),
    computeTodayNewTarget(plan, localDate),
  ]);

  const [newAssignments, reviewAssignments] = await Promise.all([
    prisma.vocabularyDailyAssignment.findMany({
      where: { planId: plan.id, localDate, assignmentType: ASSIGNMENT_NEW },
      select: { completedAt: true },
    }),
    prisma.vocabularyDailyAssignment.findMany({
      where: { planId: plan.id, localDate, assignmentType: ASSIGNMENT_REVIEW },
      select: { completedAt: true },
    }),
  ]);

  const daysTotal = endLocal ? daysInclusive(startLocal, endLocal) : 0;
  const daysElapsed = Math.min(daysTotal || Infinity, daysInclusive(startLocal, localDate));
  const daysLeft = endLocal ? (endLocal <= localDate ? 0 : daysInclusive(localDate, endLocal) - 1) : 0;

  return {
    id: plan.id,
    name: plan.name,
    level: plan.level,
    status: plan.status as PlanStatus,
    timezone: plan.timezone,
    startDate: startLocal,
    endDate: endLocal,
    localDate,
    dailyNewCount: plan.dailyNewCount,
    totalWords: plan.totalWords,
    learnedWords: introduced,
    masteredWords: mastered,
    daysTotal,
    daysElapsed,
    daysLeft,
    todayTarget,
    newToday: {
      total: newAssignments.length,
      remaining: newAssignments.filter((a) => !a.completedAt).length,
    },
    reviewToday: {
      total: reviewAssignments.length,
      remaining: reviewAssignments.filter((a) => !a.completedAt).length,
    },
  };
}

// --- Legacy single-plan DTO (kept for /api/vocabulary/plan back-compat) ---

function toPlanDTO(plan: PlanRow): StudyPlanDTO {
  return {
    id: plan.id,
    level: plan.level,
    dailyNewCount: plan.dailyNewCount,
    timezone: plan.timezone,
    isActive: plan.isActive,
    startedAt: plan.startedAt.toISOString(),
    localDate: localDateString(new Date(), plan.timezone),
  };
}

export async function getPlanDTO(userId: string): Promise<StudyPlanDTO> {
  return toPlanDTO(await ensureActivePlan(userId));
}

export async function updatePlan(
  userId: string,
  input: { dailyNewCount?: number; timezone?: string },
): Promise<StudyPlanDTO> {
  const plan = await ensureActivePlan(userId);
  const data: { dailyNewCount?: number; timezone?: string } = {};
  if (typeof input.dailyNewCount === "number") {
    data.dailyNewCount = clampDailyNew(input.dailyNewCount);
  }
  if (input.timezone) data.timezone = input.timezone;

  const updated = await prisma.vocabularyStudyPlan.update({
    where: { id: plan.id },
    data,
  });
  return toPlanDTO(updated);
}

// --- Daily NEW assignments (stable per day) ---

export type AssignmentRow = {
  id: string;
  vocabularyId: string;
  order: number;
  completedAt: Date | null;
};

export async function getOrCreateTodayNewAssignments(
  plan: PlanRow,
): Promise<{ plan: PlanRow; localDate: string; assignments: AssignmentRow[] }> {
  const userId = plan.userId;
  const localDate = localDateString(new Date(), plan.timezone);
  const target = await computeTodayNewTarget(plan, localDate);

  const assignments = await prisma.$transaction(async (tx) => {
    const existing = await tx.vocabularyDailyAssignment.findMany({
      where: { planId: plan.id, localDate, assignmentType: ASSIGNMENT_NEW },
      orderBy: { order: "asc" },
      select: { id: true, vocabularyId: true, order: true, completedAt: true },
    });

    const need = target - existing.length;
    if (need <= 0) return existing;

    // Words never introduced before in THIS plan, not suspended, still NEW.
    // Ordered by corpus frequency ("common words first") with sourceOrder as a
    // stable tiebreaker; words missing a frequency rank sort last (nulls last).
    const candidates = await tx.vocabularyEntry.findMany({
      where: {
        isActive: true,
        level: plan.level,
        dailyAssignments: { none: { planId: plan.id, assignmentType: ASSIGNMENT_NEW } },
        NOT: { masteries: { some: { userId, isSuspended: true } } },
        OR: [
          { masteries: { none: { userId } } },
          { masteries: { some: { userId, status: VOCABULARY_STATUS.NEW } } },
        ],
      },
      orderBy: [
        { level: "asc" },
        { frequencyRank: { sort: "asc", nulls: "last" } },
        { sourceOrder: "asc" },
      ],
      take: need,
      select: { id: true },
    });

    if (candidates.length === 0) return existing;

    let order = existing.length;
    for (const c of candidates) {
      await tx.vocabularyDailyAssignment.create({
        data: {
          userId,
          planId: plan.id,
          localDate,
          vocabularyId: c.id,
          assignmentType: ASSIGNMENT_NEW,
          order: order++,
        },
      });
    }

    return tx.vocabularyDailyAssignment.findMany({
      where: { planId: plan.id, localDate, assignmentType: ASSIGNMENT_NEW },
      orderBy: { order: "asc" },
      select: { id: true, vocabularyId: true, order: true, completedAt: true },
    });
  });

  return { plan, localDate, assignments };
}

export async function getOrCreateTodayReviewAssignments(
  plan: PlanRow,
): Promise<{ plan: PlanRow; localDate: string; assignments: AssignmentRow[] }> {
  const userId = plan.userId;
  const localDate = localDateString(new Date(), plan.timezone);
  const now = new Date();

  const assignments = await prisma.$transaction(async (tx) => {
    const existing = await tx.vocabularyDailyAssignment.findMany({
      where: { planId: plan.id, localDate, assignmentType: ASSIGNMENT_REVIEW },
      orderBy: { order: "asc" },
      select: { id: true, vocabularyId: true, order: true, completedAt: true },
    });
    const existingIds = new Set(existing.map((assignment) => assignment.vocabularyId));

    const due = await tx.vocabularyMastery.findMany({
      where: {
        userId,
        isSuspended: false,
        status: { in: ACTIVE_STATUSES },
        nextReviewAt: { lte: now },
        vocabulary: { isActive: true, level: plan.level },
      },
      orderBy: [
        { nextReviewAt: "asc" },
        { consecutiveWrongCount: "desc" },
        { lastReviewedAt: "desc" },
      ],
      select: { vocabularyId: true },
    });

    let order = existing.length;
    for (const mastery of due) {
      if (existingIds.has(mastery.vocabularyId)) continue;
      await tx.vocabularyDailyAssignment.create({
        data: {
          userId,
          planId: plan.id,
          localDate,
          vocabularyId: mastery.vocabularyId,
          assignmentType: ASSIGNMENT_REVIEW,
          order: order++,
        },
      });
    }

    return tx.vocabularyDailyAssignment.findMany({
      where: { planId: plan.id, localDate, assignmentType: ASSIGNMENT_REVIEW },
      orderBy: { order: "asc" },
      select: { id: true, vocabularyId: true, order: true, completedAt: true },
    });
  });

  return { plan, localDate, assignments };
}

// --- Dashboard ---

export async function getDashboard(userId: string): Promise<DashboardDTO> {
  const activePlan = await ensureActivePlan(userId);
  const { plan, localDate, assignments } = await getOrCreateTodayNewAssignments(activePlan);
  const { assignments: reviewAssignments } =
    await getOrCreateTodayReviewAssignments(activePlan);
  const startToday = startOfLocalDayUtc(localDate, plan.timezone);

  const [overdueReview, totalWords, started, mastered, avg] = await prisma.$transaction([
    prisma.vocabularyMastery.count({
      where: {
        userId,
        isSuspended: false,
        status: { in: ACTIVE_STATUSES },
        nextReviewAt: { lt: startToday },
      },
    }),
    prisma.vocabularyEntry.count({ where: { isActive: true, level: plan.level } }),
    prisma.vocabularyMastery.count({ where: { userId, status: { not: VOCABULARY_STATUS.NEW } } }),
    prisma.vocabularyMastery.count({ where: { userId, status: VOCABULARY_STATUS.MASTERED } }),
    prisma.vocabularyMastery.aggregate({
      where: { userId, status: { not: VOCABULARY_STATUS.NEW } },
      _avg: { readingScore: true, spellingScore: true, meaningScore: true },
    }),
  ]);

  return {
    localDate,
    plan: { level: plan.level, dailyNewCount: plan.dailyNewCount, timezone: plan.timezone },
    newToday: {
      total: assignments.length,
      remaining: assignments.filter((a) => !a.completedAt).length,
    },
    reviewToday: {
      total: reviewAssignments.length,
      remaining: reviewAssignments.filter((a) => !a.completedAt).length,
    },
    overdueReview,
    totals: { words: totalWords, started, mastered },
    averages: {
      reading: Math.round(avg._avg.readingScore ?? 0),
      spelling: Math.round(avg._avg.spellingScore ?? 0),
      meaning: Math.round(avg._avg.meaningScore ?? 0),
    },
  };
}

// --- Next new-word card (study card data; question serving lands in Batch 5) ---

export async function getNextNewCard(userId: string): Promise<LearnNextDTO> {
  const plan = await ensureActivePlan(userId);
  const { assignments } = await getOrCreateTodayNewAssignments(plan);
  const remaining = assignments.filter((a) => !a.completedAt);
  const next = remaining[0];
  if (!next) {
    return {
      done: true,
      remaining: 0,
      assignmentId: null,
      sessionItemId: null,
      card: null,
      question: null,
    };
  }
  const card = await getVocabularyDetail(next.vocabularyId, userId);
  return {
    done: false,
    remaining: remaining.length,
    assignmentId: next.id,
    sessionItemId: null,
    card,
    question: null,
  };
}

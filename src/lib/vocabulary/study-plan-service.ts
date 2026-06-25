import "server-only";

import { prisma } from "@/lib/db/client";
import { DAILY_NEW, VOCABULARY_LEVELS } from "@/lib/vocabulary/config";
import { getVocabularyDetail } from "@/lib/vocabulary/vocabulary-repository";
import {
  VOCABULARY_STATUS,
  type DashboardDTO,
  type LearnNextDTO,
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

// --- Plan CRUD ---

type PlanRow = {
  id: string;
  level: string;
  dailyNewCount: number;
  timezone: string;
  isActive: boolean;
  startedAt: Date;
};

export async function ensureActivePlan(userId: string): Promise<PlanRow> {
  const existing = await prisma.vocabularyStudyPlan.findFirst({
    where: { userId, isActive: true },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;

  return prisma.vocabularyStudyPlan.create({
    data: {
      userId,
      level: DEFAULT_LEVEL,
      dailyNewCount: DAILY_NEW.default,
      timezone: DEFAULT_TIMEZONE,
      isActive: true,
    },
  });
}

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

type AssignmentRow = {
  id: string;
  vocabularyId: string;
  order: number;
  completedAt: Date | null;
};

export async function getOrCreateTodayNewAssignments(
  userId: string,
): Promise<{ plan: PlanRow; localDate: string; assignments: AssignmentRow[] }> {
  const plan = await ensureActivePlan(userId);
  const localDate = localDateString(new Date(), plan.timezone);

  const assignments = await prisma.$transaction(async (tx) => {
    const existing = await tx.vocabularyDailyAssignment.findMany({
      where: { userId, localDate, assignmentType: ASSIGNMENT_NEW },
      orderBy: { order: "asc" },
      select: { id: true, vocabularyId: true, order: true, completedAt: true },
    });

    const need = plan.dailyNewCount - existing.length;
    if (need <= 0) return existing;

    // Words never introduced before (no NEW assignment on any day), not
    // suspended, still NEW. Stable order by source order.
    const candidates = await tx.vocabularyEntry.findMany({
      where: {
        isActive: true,
        level: plan.level,
        dailyAssignments: { none: { userId, assignmentType: ASSIGNMENT_NEW } },
        NOT: { masteries: { some: { userId, isSuspended: true } } },
        OR: [
          { masteries: { none: { userId } } },
          { masteries: { some: { userId, status: VOCABULARY_STATUS.NEW } } },
        ],
      },
      orderBy: [{ level: "asc" }, { sourceOrder: "asc" }],
      take: need,
      select: { id: true },
    });

    if (candidates.length === 0) return existing;

    let order = existing.length;
    for (const c of candidates) {
      await tx.vocabularyDailyAssignment.create({
        data: {
          userId,
          localDate,
          vocabularyId: c.id,
          assignmentType: ASSIGNMENT_NEW,
          order: order++,
        },
      });
    }

    return tx.vocabularyDailyAssignment.findMany({
      where: { userId, localDate, assignmentType: ASSIGNMENT_NEW },
      orderBy: { order: "asc" },
      select: { id: true, vocabularyId: true, order: true, completedAt: true },
    });
  });

  return { plan, localDate, assignments };
}

// --- Dashboard ---

export async function getDashboard(userId: string): Promise<DashboardDTO> {
  const { plan, localDate, assignments } = await getOrCreateTodayNewAssignments(userId);
  const startToday = startOfLocalDayUtc(localDate, plan.timezone);

  const reviewAssignments = await prisma.vocabularyDailyAssignment.findMany({
    where: { userId, localDate, assignmentType: ASSIGNMENT_REVIEW },
    select: { completedAt: true },
  });

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
  const { assignments } = await getOrCreateTodayNewAssignments(userId);
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

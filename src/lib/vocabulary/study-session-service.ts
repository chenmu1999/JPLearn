import "server-only";

import { prisma } from "@/lib/db/client";
import {
  MASTERY_THRESHOLD,
  MAX_REVIEW_STAGE,
  REVIEW_INTERVALS_MINUTES,
  SCORE_BOUNDS,
  SCORE_DELTAS,
} from "@/lib/vocabulary/config";
import {
  VOCABULARY_DIMENSION,
  VOCABULARY_STATUS,
  SESSION_TYPE,
  type AttemptResultDTO,
  type ExerciseType,
  type LearnNextDTO,
  type MasterySummary,
  type QuestionDTO,
  type QuestionOption,
  type QuestionPrompt,
  type SessionDTO,
  type SessionType,
  type VocabularyDimension,
  type VocabularyStatus,
} from "@/lib/vocabulary/types";
import { buildAndSaveQuestion, selectExerciseType } from "@/lib/vocabulary/question-builder";
import { evaluateAnswer } from "@/lib/vocabulary/answer-evaluator";
import { getVocabularyDetail } from "@/lib/vocabulary/vocabulary-repository";
import {
  ensureActivePlan,
  getOrCreateTodayNewAssignments,
  getOrCreateTodayReviewAssignments,
  localDateString,
} from "@/lib/vocabulary/study-plan-service";

const SESSION_LEARN = SESSION_TYPE.LEARN;
const SESSION_REVIEW = SESSION_TYPE.REVIEW;
const SESSION_WRONG_BOOK = SESSION_TYPE.WRONG_BOOK;
const ITEM_PENDING = "PENDING";
const ITEM_ISSUED = "ISSUED";
const ITEM_CORRECT = "CORRECT";
const ITEM_INCORRECT = "INCORRECT";
const SESSION_ACTIVE = "ACTIVE";
const SESSION_COMPLETED = "COMPLETED";
const SESSION_ABANDONED = "ABANDONED";
const MAX_RETRY_ATTEMPT_NO = 2;
const RETRY_DELAY_ITEMS = 3;

// ---------------------------------------------------------------------------
// Session creation / resumption
// ---------------------------------------------------------------------------

/** Create a new LEARN session or return the current active one. */
export async function createOrResumeLearnSession(userId: string): Promise<SessionDTO> {
  const plan = await ensureActivePlan(userId);
  const localDate = localDateString(new Date(), plan.timezone);

  // Check for existing active LEARN session
  const existing = await prisma.vocabularyStudySession.findFirst({
    where: { userId, sessionType: SESSION_LEARN, status: SESSION_ACTIVE },
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    const [total, pending] = await prisma.$transaction([
      prisma.vocabularySessionItem.count({ where: { sessionId: existing.id } }),
      prisma.vocabularySessionItem.count({ where: { sessionId: existing.id, status: ITEM_PENDING } }),
    ]);
    return {
      sessionId: existing.id,
      sessionType: SESSION_LEARN,
      localDate: existing.localDate,
      status: SESSION_ACTIVE,
      totalCount: total,
      pendingCount: pending,
    };
  }

  // Build new session from today's uncompleted NEW assignments
  const { assignments } = await getOrCreateTodayNewAssignments(userId);
  const uncompleted = assignments.filter((a) => !a.completedAt);

  if (uncompleted.length === 0) {
    // No work: return a virtual "done" session without persisting
    return {
      sessionId: "",
      sessionType: SESSION_LEARN,
      localDate,
      status: SESSION_COMPLETED,
      totalCount: 0,
      pendingCount: 0,
    };
  }

  const vocabIds = uncompleted.map((a) => a.vocabularyId);

  // Batch-fetch masteries and example availability
  const [masteries, examplesCheck] = await prisma.$transaction([
    prisma.vocabularyMastery.findMany({
      where: { userId, vocabularyId: { in: vocabIds } },
    }),
    prisma.vocabularyExample.findMany({
      where: {
        vocabularyId: { in: vocabIds },
        status: "ACTIVE",
        sourceType: { in: ["SOURCE", "CURATED"] },
      },
      select: { vocabularyId: true },
    }),
  ]);

  const masteryMap = new Map(masteries.map((m) => [m.vocabularyId, m]));
  const exampleSet = new Set(examplesCheck.map((e) => e.vocabularyId));

  // Create session + items in one transaction
  const session = await prisma.$transaction(async (tx) => {
    const s = await tx.vocabularyStudySession.create({
      data: { userId, sessionType: SESSION_LEARN, localDate, status: SESSION_ACTIVE },
    });

    let sequence = 0;
    for (const a of uncompleted) {
      const rawMastery = masteryMap.get(a.vocabularyId) ?? null;
      const masteryForSelect: MasterySummary | null = rawMastery
        ? {
            status: rawMastery.status as VocabularyStatus,
            readingScore: rawMastery.readingScore,
            spellingScore: rawMastery.spellingScore,
            meaningScore: rawMastery.meaningScore,
            writingScore: rawMastery.writingScore,
            contextScore: rawMastery.contextScore,
            reviewStage: rawMastery.reviewStage,
            nextReviewAt: rawMastery.nextReviewAt ? rawMastery.nextReviewAt.toISOString() : null,
            masteredAt: rawMastery.masteredAt ? rawMastery.masteredAt.toISOString() : null,
            isFavorite: rawMastery.isFavorite,
            isSuspended: rawMastery.isSuspended,
          }
        : null;

      const { exerciseType, targetDimension } = selectExerciseType(
        masteryForSelect,
        exampleSet.has(a.vocabularyId),
      );

      await tx.vocabularySessionItem.create({
        data: {
          sessionId: s.id,
          vocabularyId: a.vocabularyId,
          assignmentId: a.id,
          sequence: sequence++,
          attemptNo: 0,
          availableAfterCompletedCount: 0,
          exerciseType,
          targetDimension,
          status: ITEM_PENDING,
        },
      });
    }

    return s;
  });

  return {
    sessionId: session.id,
    sessionType: SESSION_LEARN,
    localDate: session.localDate,
    status: SESSION_ACTIVE,
    totalCount: uncompleted.length,
    pendingCount: uncompleted.length,
  };
}

export async function createOrResumeReviewSession(userId: string): Promise<SessionDTO> {
  const existing = await getActiveSessionDTO(userId, SESSION_REVIEW);
  if (existing) return existing;

  const { localDate, assignments } =
    await getOrCreateTodayReviewAssignments(userId);
  const uncompleted = assignments.filter((assignment) => !assignment.completedAt);
  return createSessionFromCandidates(
    userId,
    SESSION_REVIEW,
    localDate,
    uncompleted.map((assignment) => ({
      vocabularyId: assignment.vocabularyId,
      assignmentId: assignment.id,
    })),
  );
}

export interface WrongBookSessionFilters {
  days: 7 | 30;
  errorType?: string;
  dimension?: VocabularyDimension;
}

export async function createOrResumeWrongBookSession(
  userId: string,
  filters: WrongBookSessionFilters,
): Promise<SessionDTO> {
  const existing = await getActiveSessionDTO(userId, SESSION_WRONG_BOOK);
  if (existing) return existing;

  const plan = await ensureActivePlan(userId);
  const localDate = localDateString(new Date(), plan.timezone);
  const since = new Date(Date.now() - filters.days * 24 * 60 * 60 * 1_000);
  const attempts = await prisma.vocabularyAttempt.findMany({
    where: {
      userId,
      isCorrect: false,
      createdAt: { gte: since },
      ...(filters.errorType ? { errorType: filters.errorType } : {}),
      ...(filters.dimension ? { targetDimension: filters.dimension } : {}),
      vocabulary: { isActive: true, level: plan.level },
    },
    orderBy: { createdAt: "desc" },
    select: { vocabularyId: true },
  });
  const vocabularyIds = [...new Set(attempts.map((attempt) => attempt.vocabularyId))].slice(0, 50);

  return createSessionFromCandidates(
    userId,
    SESSION_WRONG_BOOK,
    localDate,
    vocabularyIds.map((vocabularyId) => ({ vocabularyId, assignmentId: null })),
  );
}

async function getActiveSessionDTO(
  userId: string,
  sessionType: SessionType,
): Promise<SessionDTO | null> {
  const existing = await prisma.vocabularyStudySession.findFirst({
    where: { userId, sessionType, status: SESSION_ACTIVE },
    orderBy: { createdAt: "desc" },
  });
  if (!existing) return null;

  const [totalCount, pendingCount] = await prisma.$transaction([
    prisma.vocabularySessionItem.count({ where: { sessionId: existing.id } }),
    prisma.vocabularySessionItem.count({
      where: { sessionId: existing.id, status: { in: [ITEM_PENDING, ITEM_ISSUED] } },
    }),
  ]);
  return {
    sessionId: existing.id,
    sessionType,
    localDate: existing.localDate,
    status: existing.status,
    totalCount,
    pendingCount,
  };
}

async function createSessionFromCandidates(
  userId: string,
  sessionType: SessionType,
  localDate: string,
  candidates: Array<{ vocabularyId: string; assignmentId: string | null }>,
): Promise<SessionDTO> {
  if (candidates.length === 0) {
    return {
      sessionId: "",
      sessionType,
      localDate,
      status: SESSION_COMPLETED,
      totalCount: 0,
      pendingCount: 0,
    };
  }

  const vocabularyIds = candidates.map((candidate) => candidate.vocabularyId);
  const [masteries, examples] = await prisma.$transaction([
    prisma.vocabularyMastery.findMany({
      where: { userId, vocabularyId: { in: vocabularyIds } },
    }),
    prisma.vocabularyExample.findMany({
      where: {
        vocabularyId: { in: vocabularyIds },
        status: "ACTIVE",
        sourceType: { in: ["SOURCE", "CURATED"] },
      },
      select: { vocabularyId: true },
    }),
  ]);
  const masteryMap = new Map(masteries.map((mastery) => [mastery.vocabularyId, mastery]));
  const exampleSet = new Set(examples.map((example) => example.vocabularyId));

  const session = await prisma.$transaction(async (tx) => {
    const created = await tx.vocabularyStudySession.create({
      data: { userId, sessionType, localDate, status: SESSION_ACTIVE },
    });
    for (const [sequence, candidate] of candidates.entries()) {
      const mastery = masteryMap.get(candidate.vocabularyId);
      if (!mastery) continue;
      const summary: MasterySummary = {
        status: mastery.status as VocabularyStatus,
        readingScore: mastery.readingScore,
        spellingScore: mastery.spellingScore,
        meaningScore: mastery.meaningScore,
        writingScore: mastery.writingScore,
        contextScore: mastery.contextScore,
        reviewStage: mastery.reviewStage,
        nextReviewAt: mastery.nextReviewAt?.toISOString() ?? null,
        masteredAt: mastery.masteredAt?.toISOString() ?? null,
        isFavorite: mastery.isFavorite,
        isSuspended: mastery.isSuspended,
      };
      const selected = selectExerciseType(summary, exampleSet.has(candidate.vocabularyId));
      await tx.vocabularySessionItem.create({
        data: {
          sessionId: created.id,
          vocabularyId: candidate.vocabularyId,
          assignmentId: candidate.assignmentId,
          sequence,
          attemptNo: 0,
          availableAfterCompletedCount: 0,
          exerciseType: selected.exerciseType,
          targetDimension: selected.targetDimension,
          status: ITEM_PENDING,
        },
      });
    }
    return created;
  });

  const totalCount = await prisma.vocabularySessionItem.count({
    where: { sessionId: session.id },
  });
  if (totalCount === 0) {
    await prisma.vocabularyStudySession.update({
      where: { id: session.id },
      data: { status: SESSION_COMPLETED, completedAt: new Date() },
    });
  }
  return {
    sessionId: totalCount > 0 ? session.id : "",
    sessionType,
    localDate,
    status: totalCount > 0 ? SESSION_ACTIVE : SESSION_COMPLETED,
    totalCount,
    pendingCount: totalCount,
  };
}

// ---------------------------------------------------------------------------
// Get next item (called by /learn/next)
// ---------------------------------------------------------------------------

/**
 * Get the next pending or currently-issued session item, issue a question for it,
 * and return card + question data suitable for the /learn/next response.
 */
export async function getAndIssueNextLearnItem(userId: string): Promise<LearnNextDTO> {
  return getAndIssueNextSessionItem(userId, SESSION_LEARN);
}

export async function getAndIssueNextReviewItem(
  userId: string,
  sessionType: typeof SESSION_REVIEW | typeof SESSION_WRONG_BOOK,
): Promise<LearnNextDTO> {
  return getAndIssueNextSessionItem(userId, sessionType);
}

async function getAndIssueNextSessionItem(
  userId: string,
  sessionType: SessionType,
): Promise<LearnNextDTO> {
  const sessionInfo =
    sessionType === SESSION_LEARN
      ? await createOrResumeLearnSession(userId)
      : sessionType === SESSION_REVIEW
        ? await createOrResumeReviewSession(userId)
        : await getActiveSessionDTO(userId, SESSION_WRONG_BOOK);

  if (!sessionInfo?.sessionId || sessionInfo.status !== SESSION_ACTIVE) {
    return { done: true, remaining: 0, assignmentId: null, sessionItemId: null, card: null, question: null };
  }

  const session = await prisma.vocabularyStudySession.findUnique({
    where: { id: sessionInfo.sessionId },
  });
  if (!session) {
    return { done: true, remaining: 0, assignmentId: null, sessionItemId: null, card: null, question: null };
  }

  // Always resume an already-issued item first. Otherwise, once a delayed
  // retry reaches its threshold, show it before continuing normal items.
  const issuedItem = await prisma.vocabularySessionItem.findFirst({
    where: {
      sessionId: session.id,
      status: ITEM_ISSUED,
    },
    orderBy: { sequence: "asc" },
  });
  const eligibleRetry = issuedItem
    ? null
    : await prisma.vocabularySessionItem.findFirst({
        where: {
          sessionId: session.id,
          status: ITEM_PENDING,
          attemptNo: { gt: 0 },
          availableAfterCompletedCount: { lte: session.completedItemCount },
        },
        orderBy: [{ availableAfterCompletedCount: "asc" }, { sequence: "asc" }],
      });
  const normalItem = issuedItem || eligibleRetry
    ? null
    : await prisma.vocabularySessionItem.findFirst({
        where: {
          sessionId: session.id,
          status: ITEM_PENDING,
          attemptNo: 0,
        },
        orderBy: { sequence: "asc" },
      });
  const item = issuedItem ?? eligibleRetry ?? normalItem;

  if (!item) {
    // No normally available item remains. A delayed retry now belongs at the
    // end of the round, so release the earliest one instead of deadlocking.
    const futureItem = await prisma.vocabularySessionItem.findFirst({
      where: { sessionId: session.id, status: ITEM_PENDING },
      orderBy: { sequence: "asc" },
    });
    if (!futureItem) {
      // Session truly complete
      await prisma.vocabularyStudySession.update({
        where: { id: session.id },
        data: { status: SESSION_COMPLETED, completedAt: new Date() },
      });
      return { done: true, remaining: 0, assignmentId: null, sessionItemId: null, card: null, question: null };
    }
    await prisma.vocabularySessionItem.update({
      where: { id: futureItem.id },
      data: { availableAfterCompletedCount: session.completedItemCount },
    });
    return getAndIssueNextSessionItem(userId, sessionType);
  }

  // Get card data
  const card = await getVocabularyDetail(item.vocabularyId, userId);
  if (!card) {
    return { done: true, remaining: 0, assignmentId: null, sessionItemId: null, card: null, question: null };
  }

  // Issue or re-use question
  let question: QuestionDTO;

  if (item.status === ITEM_ISSUED && item.questionId) {
    // Already issued — fetch existing question
    const existingQ = await prisma.vocabularyQuestion.findUnique({
      where: { id: item.questionId },
    });

    if (existingQ && existingQ.status === "ISSUED" && new Date() < existingQ.expiresAt) {
      question = {
        questionId: existingQ.id,
        exerciseType: existingQ.exerciseType as ExerciseType,
        targetDimension: existingQ.targetDimension as VocabularyDimension,
        prompt: JSON.parse(existingQ.promptJson) as QuestionPrompt,
        options: existingQ.optionsJson
          ? (JSON.parse(existingQ.optionsJson) as QuestionOption[])
          : null,
      };
    } else {
      // Expired or missing — re-issue
      if (existingQ?.status === "ISSUED") {
        await prisma.vocabularyQuestion.update({
          where: { id: existingQ.id },
          data: { status: "EXPIRED" },
        });
      }
      question = await issueQuestion(item.id, card, item, userId);
    }
  } else {
    // PENDING — issue new question
    question = await issueQuestion(item.id, card, item, userId);
  }

  const remaining = await prisma.vocabularySessionItem.count({
    where: {
      sessionId: session.id,
      status: { in: [ITEM_PENDING, ITEM_ISSUED] },
    },
  });

  return {
    done: false,
    remaining,
    assignmentId: item.assignmentId ?? null,
    sessionItemId: item.id,
    card,
    question,
  };
}

async function issueQuestion(
  itemId: string,
  card: NonNullable<Awaited<ReturnType<typeof getVocabularyDetail>>>,
  item: { exerciseType: string; targetDimension: string; assignmentId: string | null },
  userId: string,
): Promise<QuestionDTO> {
  const question = await buildAndSaveQuestion(
    card,
    item.exerciseType as ExerciseType,
    item.targetDimension as VocabularyDimension,
    userId,
    item.assignmentId ?? null,
    itemId,
  );
  // Update session item to ISSUED
  await prisma.vocabularySessionItem.update({
    where: { id: itemId },
    data: {
      status: ITEM_ISSUED,
      questionId: question.questionId,
      exerciseType: question.exerciseType,
      targetDimension: question.targetDimension,
      updatedAt: new Date(),
    },
  });
  return question;
}

// ---------------------------------------------------------------------------
// Submit attempt
// ---------------------------------------------------------------------------

export interface SubmitAttemptParams {
  questionId: string;
  userId: string;
  userAnswer: string;
  usedHint: boolean;
  responseTimeMs: number | null;
}

export async function submitAttempt(params: SubmitAttemptParams): Promise<AttemptResultDTO> {
  const { questionId, userId, userAnswer, usedHint, responseTimeMs } = params;

  // 1. Validate question
  const question = await prisma.vocabularyQuestion.findUnique({ where: { id: questionId } });
  if (!question) throw new QuizError("QUESTION_NOT_FOUND", "题目不存在。", 404);
  if (question.userId !== userId) throw new QuizError("FORBIDDEN", "无权访问该题目。", 403);
  if (question.status !== "ISSUED") throw new QuizError("ALREADY_ANSWERED", "该题目已作答或已过期。", 409);
  if (new Date() > question.expiresAt) throw new QuizError("EXPIRED", "题目已过期。", 410);

  // 2. Evaluate answer
  const acceptedAnswers: string[] = JSON.parse(question.acceptedAnswersJson);
  const evaluation = evaluateAnswer(
    userAnswer,
    acceptedAnswers,
    question.exerciseType as ExerciseType,
  );

  // 3. Get session item (optional — might be null if question was issued outside a session)
  const sessionItem = question.sessionItemId
    ? await prisma.vocabularySessionItem.findUnique({
        where: { id: question.sessionItemId },
        include: { session: true },
      })
    : null;

  const sessionId = sessionItem?.sessionId ?? null;
  if (
    sessionItem &&
    (sessionItem.session.userId !== userId ||
      sessionItem.session.status !== SESSION_ACTIVE ||
      sessionItem.status !== ITEM_ISSUED ||
      sessionItem.questionId !== questionId)
  ) {
    throw new QuizError("QUESTION_STATE_INVALID", "题目状态无效，请加载下一题。", 409);
  }

  // 4. Transaction
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const claim = await tx.vocabularyQuestion.updateMany({
      where: {
        id: questionId,
        userId,
        status: "ISSUED",
        expiresAt: { gt: now },
      },
      data: { status: "ANSWERED", answeredAt: now },
    });
    if (claim.count !== 1) {
      throw new QuizError("ALREADY_ANSWERED", "该题目已作答或已过期。", 409);
    }

    // a. Fetch current mastery (inside TX for consistency)
    const mastery = await tx.vocabularyMastery.findUnique({
      where: { userId_vocabularyId: { userId, vocabularyId: question.vocabularyId } },
    });

    // b. Compute score delta for the relevant dimension
    const targetDim = question.targetDimension as VocabularyDimension;
    const scoreBefore = getDimensionScore(mastery, targetDim);
    const delta = evaluation.isCorrect
      ? usedHint
        ? SCORE_DELTAS.correctWithHint
        : SCORE_DELTAS.correct
      : SCORE_DELTAS.wrong;
    const scoreAfter = Math.min(
      SCORE_BOUNDS.max,
      Math.max(SCORE_BOUNDS.min, scoreBefore + delta),
    );

    // c. Determine if this is an "input" exercise (affects lastInputCorrectAt / Wrong)
    const isInputExercise =
      question.exerciseType === "WRITING_TO_READING_INPUT" ||
      question.exerciseType === "AUDIO_TO_READING_INPUT";

    const lastInputCorrectAt =
      isInputExercise && evaluation.isCorrect ? now : mastery?.lastInputCorrectAt ?? null;
    const lastInputWrongAt =
      isInputExercise && !evaluation.isCorrect ? now : mastery?.lastInputWrongAt ?? null;

    // d. Review stage and next review. A newly introduced word always enters
    // stage 0 first (10-minute review); later independent reviews advance it.
    const currentStage = mastery?.reviewStage ?? 0;
    const currentStatus = mastery?.status ?? VOCABULARY_STATUS.NEW;
    const { stage: newStage, nextReviewAt } = computeNextReview(
      evaluation.isCorrect,
      usedHint,
      currentStage,
      currentStatus,
      now,
    );

    // e. New dimension scores (merge with existing)
    const existingScores = {
      readingScore: mastery?.readingScore ?? 0,
      spellingScore: mastery?.spellingScore ?? 0,
      meaningScore: mastery?.meaningScore ?? 0,
      writingScore: mastery?.writingScore ?? 0,
      contextScore: mastery?.contextScore ?? 0,
    };
    const updatedScores = { ...existingScores, ...buildScoreUpdate(targetDim, scoreAfter) };

    // f. Status
    const newStatus = computeNextStatus(
      currentStatus,
      updatedScores.readingScore,
      updatedScores.spellingScore,
    updatedScores.meaningScore,
    lastInputCorrectAt,
    lastInputWrongAt,
    newStage,
    evaluation.isCorrect,
    );

    const newMasteredAt =
      newStatus === VOCABULARY_STATUS.MASTERED
        ? (mastery?.masteredAt ?? now)
        : mastery?.masteredAt ?? null;

    // g. Upsert VocabularyMastery
    const consecutiveCorrect = evaluation.isCorrect
      ? (mastery?.consecutiveCorrectCount ?? 0) + 1
      : 0;
    const consecutiveWrong = evaluation.isCorrect
      ? 0
      : (mastery?.consecutiveWrongCount ?? 0) + 1;

    await tx.vocabularyMastery.upsert({
      where: { userId_vocabularyId: { userId, vocabularyId: question.vocabularyId } },
      create: {
        userId,
        vocabularyId: question.vocabularyId,
        status: newStatus,
        ...updatedScores,
        reviewStage: newStage,
        nextReviewAt,
        lastReviewedAt: now,
        lastInputCorrectAt,
        lastInputWrongAt,
        consecutiveCorrectCount: consecutiveCorrect,
        consecutiveWrongCount: consecutiveWrong,
        masteredAt: newMasteredAt,
      },
      update: {
        status: newStatus,
        ...updatedScores,
        reviewStage: newStage,
        nextReviewAt,
        lastReviewedAt: now,
        lastInputCorrectAt,
        lastInputWrongAt,
        consecutiveCorrectCount: consecutiveCorrect,
        consecutiveWrongCount: consecutiveWrong,
        masteredAt: newMasteredAt,
      },
    });

    // h. Resolve the display answer without exposing option IDs to the result UI.
    const acceptedAnswer = resolveAcceptedAnswerText(
      question.optionsJson,
      evaluation.acceptedAnswer,
    );

    // i. Create VocabularyAttempt
    const attempt = await tx.vocabularyAttempt.create({
      data: {
        questionId,
        userId,
        vocabularyId: question.vocabularyId,
        assignmentId: question.assignmentId,
        sessionId,
        sessionItemId: question.sessionItemId,
        source: sessionItem?.session.sessionType ?? "COMPREHENSIVE",
        exerciseType: question.exerciseType,
        targetDimension: question.targetDimension,
        promptSnapshotJson: question.promptJson,
        userAnswer,
        acceptedAnswer,
        isCorrect: evaluation.isCorrect,
        usedHint,
        responseTimeMs,
        errorType: evaluation.errorType,
        scoreBefore,
        scoreAfter,
        reviewStageBefore: currentStage,
        reviewStageAfter: newStage,
        nextReviewAtAfter: nextReviewAt,
      },
    });

    // j. Update session item and session
    let remainingCount = 0;
    let sessionComplete = false;

    if (sessionItem && sessionId) {
      const currentSession = await tx.vocabularyStudySession.findUnique({
        where: { id: sessionId },
      });
      const completedAfterThisAnswer = (currentSession?.completedItemCount ?? 0) + 1;

      await tx.vocabularyStudySession.update({
        where: { id: sessionId },
        data: {
          completedItemCount: { increment: 1 },
          lastActivityAt: now,
        },
      });

      if (evaluation.isCorrect) {
        // Mark item CORRECT
        await tx.vocabularySessionItem.update({
          where: { id: sessionItem.id },
          data: { status: ITEM_CORRECT },
        });

        // Mark assignment completed
        if (sessionItem.assignmentId) {
          await tx.vocabularyDailyAssignment.update({
            where: { id: sessionItem.assignmentId },
            data: { completedAt: now },
          });
        }

        // Check session complete (no more pending/issued items)
        remainingCount = await tx.vocabularySessionItem.count({
          where: { sessionId, status: { in: [ITEM_PENDING, ITEM_ISSUED] } },
        });

        if (remainingCount === 0) {
          await tx.vocabularyStudySession.update({
            where: { id: sessionId },
            data: { status: SESSION_COMPLETED, completedAt: now },
          });
          sessionComplete = true;
        }
      } else {
        // Wrong answer
        await tx.vocabularySessionItem.update({
          where: { id: sessionItem.id },
          data: { status: ITEM_INCORRECT },
        });

        if (sessionItem.attemptNo < MAX_RETRY_ATTEMPT_NO) {
          // Create retry item
          const maxSeq = await tx.vocabularySessionItem.aggregate({
            where: { sessionId },
            _max: { sequence: true },
          });
          const nextSeq = (maxSeq._max.sequence ?? 0) + 1;

          await tx.vocabularySessionItem.create({
            data: {
              sessionId,
              vocabularyId: sessionItem.vocabularyId,
              assignmentId: sessionItem.assignmentId,
              sourceItemId: sessionItem.sourceItemId ?? sessionItem.id,
              sequence: nextSeq,
              attemptNo: sessionItem.attemptNo + 1,
              availableAfterCompletedCount: completedAfterThisAnswer + RETRY_DELAY_ITEMS,
              exerciseType: sessionItem.exerciseType,
              targetDimension: sessionItem.targetDimension,
              status: ITEM_PENDING,
            },
          });
        } else {
          // Max retries reached: finish today's NEW assignment and rely on the
          // 10-minute review schedule instead of immediately creating a new
          // LEARN session for the same word.
          if (sessionItem.assignmentId) {
            await tx.vocabularyDailyAssignment.update({
              where: { id: sessionItem.assignmentId },
              data: { completedAt: now },
            });
          }

          remainingCount = await tx.vocabularySessionItem.count({
            where: { sessionId, status: { in: [ITEM_PENDING, ITEM_ISSUED] } },
          });
          if (remainingCount === 0) {
            await tx.vocabularyStudySession.update({
              where: { id: sessionId },
              data: { status: SESSION_COMPLETED, completedAt: now },
            });
            sessionComplete = true;
          }
        }

        if (!sessionComplete) {
          remainingCount = await tx.vocabularySessionItem.count({
            where: { sessionId, status: { in: [ITEM_PENDING, ITEM_ISSUED] } },
          });
        }
      }
    }

    return {
      attemptId: attempt.id,
      isCorrect: evaluation.isCorrect,
      errorType: evaluation.errorType,
      acceptedAnswer,
      scoreBefore,
      scoreAfter,
      remainingCount,
      sessionComplete,
      nextReviewAt: nextReviewAt?.toISOString() ?? null,
    } satisfies AttemptResultDTO;
  });

  return result;
}

// ---------------------------------------------------------------------------
// Abandon session
// ---------------------------------------------------------------------------

export async function abandonSession(sessionId: string, userId: string): Promise<void> {
  const session = await prisma.vocabularyStudySession.findUnique({ where: { id: sessionId } });
  if (!session) throw new QuizError("SESSION_NOT_FOUND", "会话不存在。", 404);
  if (session.userId !== userId) throw new QuizError("FORBIDDEN", "无权操作该会话。", 403);
  if (session.status !== SESSION_ACTIVE) return; // already done / abandoned — no-op

  await prisma.$transaction(async (tx) => {
    const issuedItems = await tx.vocabularySessionItem.findMany({
      where: { sessionId, status: ITEM_ISSUED, questionId: { not: null } },
      select: { questionId: true },
    });
    const questionIds = issuedItems
      .map((item) => item.questionId)
      .filter((id): id is string => id !== null);

    if (questionIds.length > 0) {
      await tx.vocabularyQuestion.updateMany({
        where: { id: { in: questionIds }, status: "ISSUED" },
        data: { status: "EXPIRED" },
      });
    }

    await tx.vocabularyStudySession.update({
      where: { id: sessionId },
      data: { status: SESSION_ABANDONED, lastActivityAt: new Date() },
    });
  });
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function getDimensionScore(
  mastery: { readingScore: number; spellingScore: number; meaningScore: number; writingScore: number; contextScore: number } | null,
  dimension: VocabularyDimension,
): number {
  if (!mastery) return 0;
  switch (dimension) {
    case VOCABULARY_DIMENSION.READING: return mastery.readingScore;
    case VOCABULARY_DIMENSION.SPELLING: return mastery.spellingScore;
    case VOCABULARY_DIMENSION.MEANING: return mastery.meaningScore;
    case VOCABULARY_DIMENSION.WRITING: return mastery.writingScore;
    case VOCABULARY_DIMENSION.CONTEXT: return mastery.contextScore;
  }
}

function buildScoreUpdate(
  dimension: VocabularyDimension,
  score: number,
): Partial<{ readingScore: number; spellingScore: number; meaningScore: number; writingScore: number; contextScore: number }> {
  switch (dimension) {
    case VOCABULARY_DIMENSION.READING: return { readingScore: score };
    case VOCABULARY_DIMENSION.SPELLING: return { spellingScore: score };
    case VOCABULARY_DIMENSION.MEANING: return { meaningScore: score };
    case VOCABULARY_DIMENSION.WRITING: return { writingScore: score };
    case VOCABULARY_DIMENSION.CONTEXT: return { contextScore: score };
  }
}

function computeNextReview(
  isCorrect: boolean,
  usedHint: boolean,
  currentStage: number,
  currentStatus: string,
  now: Date,
): { stage: number; nextReviewAt: Date } {
  if (currentStatus === VOCABULARY_STATUS.NEW) {
    return {
      stage: 0,
      nextReviewAt: new Date(now.getTime() + REVIEW_INTERVALS_MINUTES[0] * 60_000),
    };
  }
  if (isCorrect && !usedHint) {
    const nextStage = Math.min(MAX_REVIEW_STAGE, currentStage + 1);
    return {
      stage: nextStage,
      nextReviewAt: new Date(now.getTime() + REVIEW_INTERVALS_MINUTES[nextStage] * 60_000),
    };
  }
  if (isCorrect && usedHint) {
    return {
      stage: currentStage,
      nextReviewAt: new Date(now.getTime() + REVIEW_INTERVALS_MINUTES[currentStage] * 60_000),
    };
  }
  // Wrong
  const nextStage = Math.max(0, currentStage - 1);
  return {
    stage: nextStage,
    nextReviewAt: new Date(now.getTime() + REVIEW_INTERVALS_MINUTES[0] * 60_000), // 10 min
  };
}

function resolveAcceptedAnswerText(
  optionsJson: string | null,
  acceptedAnswer: string,
): string {
  if (!optionsJson) return acceptedAnswer;
  try {
    const options = JSON.parse(optionsJson) as QuestionOption[];
    return options.find((option) => option.id === acceptedAnswer)?.text ?? acceptedAnswer;
  } catch {
    return acceptedAnswer;
  }
}

function computeNextStatus(
  currentStatus: string,
  readingScore: number,
  spellingScore: number,
  meaningScore: number,
  lastInputCorrectAt: Date | null,
  lastInputWrongAt: Date | null,
  nextStage: number,
  isCorrect: boolean,
): string {
  if (currentStatus === VOCABULARY_STATUS.MASTERED && !isCorrect) {
    return VOCABULARY_STATUS.REVIEWING;
  }
  const mastered =
    readingScore >= MASTERY_THRESHOLD &&
    spellingScore >= MASTERY_THRESHOLD &&
    meaningScore >= MASTERY_THRESHOLD &&
    lastInputCorrectAt !== null &&
    (lastInputWrongAt === null || lastInputCorrectAt > lastInputWrongAt);

  if (mastered) return VOCABULARY_STATUS.MASTERED;
  if (currentStatus === VOCABULARY_STATUS.MASTERED) return VOCABULARY_STATUS.REVIEWING;
  if (nextStage >= 2) return VOCABULARY_STATUS.REVIEWING;
  return VOCABULARY_STATUS.LEARNING;
}

// ---------------------------------------------------------------------------
// Error type for throwing structured quiz errors
// ---------------------------------------------------------------------------

export class QuizError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus: number = 400,
  ) {
    super(message);
    this.name = "QuizError";
  }
}

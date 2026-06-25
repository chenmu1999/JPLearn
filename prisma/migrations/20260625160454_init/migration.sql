-- CreateTable
CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "displayName" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "KnowledgePoint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "sourceName" TEXT,
    "sourceKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MasteryState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "knowledgePointId" TEXT NOT NULL,
    "masteryScore" INTEGER NOT NULL DEFAULT 0,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "wrongCount" INTEGER NOT NULL DEFAULT 0,
    "isMastered" BOOLEAN NOT NULL DEFAULT false,
    "lastPracticedAt" DATETIME,
    "masteredAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MasteryState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MasteryState_knowledgePointId_fkey" FOREIGN KEY ("knowledgePointId") REFERENCES "KnowledgePoint" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VocabularyEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "knowledgePointId" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "sourceGuid" TEXT,
    "level" TEXT NOT NULL,
    "lemma" TEXT NOT NULL,
    "primaryWriting" TEXT NOT NULL,
    "primaryReading" TEXT NOT NULL,
    "partOfSpeech" TEXT,
    "category" TEXT,
    "meaningEn" TEXT,
    "usageNoteZh" TEXT,
    "rawDataJson" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sourceOrder" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VocabularyEntry_knowledgePointId_fkey" FOREIGN KEY ("knowledgePointId") REFERENCES "KnowledgePoint" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VocabularySense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vocabularyId" TEXT NOT NULL,
    "meaningZh" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "noteZh" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VocabularySense_vocabularyId_fkey" FOREIGN KEY ("vocabularyId") REFERENCES "VocabularyEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VocabularyAcceptedForm" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vocabularyId" TEXT NOT NULL,
    "formType" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "noteZh" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VocabularyAcceptedForm_vocabularyId_fkey" FOREIGN KEY ("vocabularyId") REFERENCES "VocabularyEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VocabularyExample" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vocabularyId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "japanese" TEXT NOT NULL,
    "chinese" TEXT,
    "targetSurface" TEXT,
    "usageNoteZh" TEXT,
    "difficulty" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "model" TEXT,
    "promptVersion" TEXT,
    "generationContextJson" TEXT,
    "introducedKnowledgeJson" TEXT,
    "rawAiResponse" TEXT,
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VocabularyExample_vocabularyId_fkey" FOREIGN KEY ("vocabularyId") REFERENCES "VocabularyEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VocabularyMastery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "vocabularyId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "readingScore" INTEGER NOT NULL DEFAULT 0,
    "spellingScore" INTEGER NOT NULL DEFAULT 0,
    "meaningScore" INTEGER NOT NULL DEFAULT 0,
    "writingScore" INTEGER NOT NULL DEFAULT 0,
    "contextScore" INTEGER NOT NULL DEFAULT 0,
    "reviewStage" INTEGER NOT NULL DEFAULT 0,
    "nextReviewAt" DATETIME,
    "lastReviewedAt" DATETIME,
    "lastInputCorrectAt" DATETIME,
    "lastInputWrongAt" DATETIME,
    "consecutiveCorrectCount" INTEGER NOT NULL DEFAULT 0,
    "consecutiveWrongCount" INTEGER NOT NULL DEFAULT 0,
    "masteredAt" DATETIME,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "isSuspended" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VocabularyMastery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "VocabularyMastery_vocabularyId_fkey" FOREIGN KEY ("vocabularyId") REFERENCES "VocabularyEntry" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VocabularyStudyPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'N5',
    "dailyNewCount" INTEGER NOT NULL DEFAULT 10,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "targetCompletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VocabularyStudyPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VocabularyDailyAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "localDate" TEXT NOT NULL,
    "vocabularyId" TEXT NOT NULL,
    "assignmentType" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VocabularyDailyAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "VocabularyDailyAssignment_vocabularyId_fkey" FOREIGN KEY ("vocabularyId") REFERENCES "VocabularyEntry" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VocabularyStudySession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "sessionType" TEXT NOT NULL,
    "localDate" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "completedItemCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VocabularyStudySession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VocabularySessionItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "vocabularyId" TEXT NOT NULL,
    "assignmentId" TEXT,
    "sourceItemId" TEXT,
    "sequence" INTEGER NOT NULL,
    "attemptNo" INTEGER NOT NULL DEFAULT 0,
    "availableAfterCompletedCount" INTEGER NOT NULL DEFAULT 0,
    "exerciseType" TEXT NOT NULL,
    "targetDimension" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "questionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VocabularySessionItem_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "VocabularyStudySession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VocabularySessionItem_vocabularyId_fkey" FOREIGN KEY ("vocabularyId") REFERENCES "VocabularyEntry" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VocabularyQuestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "vocabularyId" TEXT NOT NULL,
    "assignmentId" TEXT,
    "sessionItemId" TEXT,
    "exerciseType" TEXT NOT NULL,
    "targetDimension" TEXT NOT NULL,
    "promptJson" TEXT NOT NULL,
    "optionsJson" TEXT,
    "acceptedAnswersJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "issuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "answeredAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VocabularyQuestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "VocabularyQuestion_vocabularyId_fkey" FOREIGN KEY ("vocabularyId") REFERENCES "VocabularyEntry" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VocabularyAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "questionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vocabularyId" TEXT NOT NULL,
    "assignmentId" TEXT,
    "sessionId" TEXT,
    "sessionItemId" TEXT,
    "source" TEXT NOT NULL,
    "exerciseType" TEXT NOT NULL,
    "targetDimension" TEXT NOT NULL,
    "promptSnapshotJson" TEXT,
    "userAnswer" TEXT NOT NULL,
    "acceptedAnswer" TEXT,
    "isCorrect" BOOLEAN NOT NULL,
    "usedHint" BOOLEAN NOT NULL DEFAULT false,
    "responseTimeMs" INTEGER,
    "errorType" TEXT,
    "scoreBefore" INTEGER,
    "scoreAfter" INTEGER,
    "reviewStageBefore" INTEGER,
    "reviewStageAfter" INTEGER,
    "nextReviewAtAfter" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VocabularyAttempt_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "VocabularyQuestion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "VocabularyAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "VocabularyAttempt_vocabularyId_fkey" FOREIGN KEY ("vocabularyId") REFERENCES "VocabularyEntry" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "VocabularyAttempt_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "VocabularyStudySession" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgePoint_sourceKey_key" ON "KnowledgePoint"("sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "MasteryState_userId_knowledgePointId_key" ON "MasteryState"("userId", "knowledgePointId");

-- CreateIndex
CREATE UNIQUE INDEX "VocabularyEntry_knowledgePointId_key" ON "VocabularyEntry"("knowledgePointId");

-- CreateIndex
CREATE UNIQUE INDEX "VocabularyEntry_sourceKey_key" ON "VocabularyEntry"("sourceKey");

-- CreateIndex
CREATE INDEX "VocabularyEntry_primaryWriting_idx" ON "VocabularyEntry"("primaryWriting");

-- CreateIndex
CREATE INDEX "VocabularyEntry_primaryReading_idx" ON "VocabularyEntry"("primaryReading");

-- CreateIndex
CREATE UNIQUE INDEX "VocabularyEntry_level_sourceOrder_key" ON "VocabularyEntry"("level", "sourceOrder");

-- CreateIndex
CREATE INDEX "VocabularySense_meaningZh_idx" ON "VocabularySense"("meaningZh");

-- CreateIndex
CREATE UNIQUE INDEX "VocabularySense_vocabularyId_order_key" ON "VocabularySense"("vocabularyId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "VocabularyAcceptedForm_vocabularyId_formType_value_key" ON "VocabularyAcceptedForm"("vocabularyId", "formType", "value");

-- CreateIndex
CREATE INDEX "VocabularyExample_vocabularyId_isDefault_status_idx" ON "VocabularyExample"("vocabularyId", "isDefault", "status");

-- CreateIndex
CREATE INDEX "VocabularyMastery_userId_status_isSuspended_idx" ON "VocabularyMastery"("userId", "status", "isSuspended");

-- CreateIndex
CREATE INDEX "VocabularyMastery_userId_nextReviewAt_isSuspended_idx" ON "VocabularyMastery"("userId", "nextReviewAt", "isSuspended");

-- CreateIndex
CREATE UNIQUE INDEX "VocabularyMastery_userId_vocabularyId_key" ON "VocabularyMastery"("userId", "vocabularyId");

-- CreateIndex
CREATE INDEX "VocabularyStudyPlan_userId_isActive_idx" ON "VocabularyStudyPlan"("userId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "VocabularyDailyAssignment_userId_localDate_vocabularyId_assignmentType_key" ON "VocabularyDailyAssignment"("userId", "localDate", "vocabularyId", "assignmentType");

-- CreateIndex
CREATE UNIQUE INDEX "VocabularyDailyAssignment_userId_localDate_assignmentType_order_key" ON "VocabularyDailyAssignment"("userId", "localDate", "assignmentType", "order");

-- CreateIndex
CREATE INDEX "VocabularyStudySession_userId_status_sessionType_idx" ON "VocabularyStudySession"("userId", "status", "sessionType");

-- CreateIndex
CREATE INDEX "VocabularySessionItem_sessionId_status_sequence_idx" ON "VocabularySessionItem"("sessionId", "status", "sequence");

-- CreateIndex
CREATE INDEX "VocabularySessionItem_sessionId_availableAfterCompletedCount_sequence_idx" ON "VocabularySessionItem"("sessionId", "availableAfterCompletedCount", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "VocabularySessionItem_sessionId_sequence_key" ON "VocabularySessionItem"("sessionId", "sequence");

-- CreateIndex
CREATE INDEX "VocabularyQuestion_userId_status_expiresAt_idx" ON "VocabularyQuestion"("userId", "status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "VocabularyAttempt_questionId_key" ON "VocabularyAttempt"("questionId");

-- CreateIndex
CREATE INDEX "VocabularyAttempt_userId_vocabularyId_createdAt_idx" ON "VocabularyAttempt"("userId", "vocabularyId", "createdAt");

-- CreateIndex
CREATE INDEX "VocabularyAttempt_userId_errorType_createdAt_idx" ON "VocabularyAttempt"("userId", "errorType", "createdAt");

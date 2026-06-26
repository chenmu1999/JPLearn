-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_VocabularyDailyAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "planId" TEXT,
    "localDate" TEXT NOT NULL,
    "vocabularyId" TEXT NOT NULL,
    "assignmentType" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VocabularyDailyAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "VocabularyDailyAssignment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "VocabularyStudyPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VocabularyDailyAssignment_vocabularyId_fkey" FOREIGN KEY ("vocabularyId") REFERENCES "VocabularyEntry" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_VocabularyDailyAssignment" ("assignmentType", "completedAt", "createdAt", "id", "localDate", "order", "updatedAt", "userId", "vocabularyId") SELECT "assignmentType", "completedAt", "createdAt", "id", "localDate", "order", "updatedAt", "userId", "vocabularyId" FROM "VocabularyDailyAssignment";
DROP TABLE "VocabularyDailyAssignment";
ALTER TABLE "new_VocabularyDailyAssignment" RENAME TO "VocabularyDailyAssignment";
CREATE INDEX "VocabularyDailyAssignment_userId_localDate_assignmentType_idx" ON "VocabularyDailyAssignment"("userId", "localDate", "assignmentType");
CREATE UNIQUE INDEX "VocabularyDailyAssignment_planId_localDate_vocabularyId_assignmentType_key" ON "VocabularyDailyAssignment"("planId", "localDate", "vocabularyId", "assignmentType");
CREATE UNIQUE INDEX "VocabularyDailyAssignment_planId_localDate_assignmentType_order_key" ON "VocabularyDailyAssignment"("planId", "localDate", "assignmentType", "order");
CREATE TABLE "new_VocabularyStudyPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT,
    "level" TEXT NOT NULL DEFAULT 'N5',
    "dailyNewCount" INTEGER NOT NULL DEFAULT 10,
    "totalWords" INTEGER NOT NULL DEFAULT 0,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Shanghai',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "targetCompletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VocabularyStudyPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_VocabularyStudyPlan" ("createdAt", "dailyNewCount", "id", "isActive", "level", "startedAt", "targetCompletedAt", "timezone", "updatedAt", "userId") SELECT "createdAt", "dailyNewCount", "id", "isActive", "level", "startedAt", "targetCompletedAt", "timezone", "updatedAt", "userId" FROM "VocabularyStudyPlan";
DROP TABLE "VocabularyStudyPlan";
ALTER TABLE "new_VocabularyStudyPlan" RENAME TO "VocabularyStudyPlan";
CREATE INDEX "VocabularyStudyPlan_userId_status_idx" ON "VocabularyStudyPlan"("userId", "status");
CREATE INDEX "VocabularyStudyPlan_userId_isActive_idx" ON "VocabularyStudyPlan"("userId", "isActive");
CREATE TABLE "new_VocabularyStudySession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "planId" TEXT,
    "sessionType" TEXT NOT NULL,
    "localDate" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "completedItemCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VocabularyStudySession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserProfile" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "VocabularyStudySession_planId_fkey" FOREIGN KEY ("planId") REFERENCES "VocabularyStudyPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_VocabularyStudySession" ("completedAt", "completedItemCount", "createdAt", "id", "lastActivityAt", "localDate", "sessionType", "startedAt", "status", "updatedAt", "userId") SELECT "completedAt", "completedItemCount", "createdAt", "id", "lastActivityAt", "localDate", "sessionType", "startedAt", "status", "updatedAt", "userId" FROM "VocabularyStudySession";
DROP TABLE "VocabularyStudySession";
ALTER TABLE "new_VocabularyStudySession" RENAME TO "VocabularyStudySession";
CREATE INDEX "VocabularyStudySession_userId_status_sessionType_idx" ON "VocabularyStudySession"("userId", "status", "sessionType");
CREATE INDEX "VocabularyStudySession_planId_status_sessionType_idx" ON "VocabularyStudySession"("planId", "status", "sessionType");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

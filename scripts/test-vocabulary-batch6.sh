#!/usr/bin/env bash

set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-${HOME}/JPLearn-vocab}"
PORT="${PORT:-$((3600 + ($$ % 300)))}"
BASE_URL="http://127.0.0.1:${PORT}"
DATABASE_URL="${DATABASE_URL:-file:/tmp/jplearn-vocabulary-batch6-$$.db}"
SESSION_SECRET="${SESSION_SECRET:-batch6-smoke-session-secret-20260626}"
DB_PATH="${DATABASE_URL#file:}"

cd "${PROJECT_DIR}"
export DATABASE_URL SESSION_SECRET
rm -f "${DB_PATH}" "${DB_PATH}-journal"

pnpm exec prisma migrate deploy >/tmp/jplearn-batch6-migrate.log
pnpm db:seed >/tmp/jplearn-batch6-seed.log
pnpm db:import:n5 >/tmp/jplearn-batch6-import.log

node - <<'NODE'
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
(async () => {
  const vocabulary = await prisma.vocabularyEntry.findFirst({
    where: { level: "N5", isActive: true },
    orderBy: { sourceOrder: "asc" },
  });
  if (!vocabulary) throw new Error("No vocabulary imported");
  const mastery = await prisma.vocabularyMastery.create({
    data: {
      userId: "local-user",
      vocabularyId: vocabulary.id,
      status: "LEARNING",
      readingScore: 20,
      spellingScore: 0,
      meaningScore: 0,
      reviewStage: 0,
      nextReviewAt: new Date(Date.now() - 60_000),
    },
  });
  const question = await prisma.vocabularyQuestion.create({
    data: {
      userId: "local-user",
      vocabularyId: vocabulary.id,
      exerciseType: "WRITING_TO_READING_INPUT",
      targetDimension: "reading",
      promptJson: JSON.stringify({ writing: vocabulary.primaryWriting }),
      acceptedAnswersJson: JSON.stringify([vocabulary.primaryReading]),
      status: "ANSWERED",
      expiresAt: new Date(Date.now() + 86_400_000),
      answeredAt: new Date(),
    },
  });
  await prisma.vocabularyAttempt.create({
    data: {
      questionId: question.id,
      userId: "local-user",
      vocabularyId: vocabulary.id,
      source: "LEARN",
      exerciseType: question.exerciseType,
      targetDimension: question.targetDimension,
      userAnswer: "__wrong__",
      acceptedAnswer: vocabulary.primaryReading,
      isCorrect: false,
      errorType: "KANA_SPELLING",
      scoreBefore: 20,
      scoreAfter: 10,
      reviewStageBefore: 0,
      reviewStageAfter: 0,
      nextReviewAtAfter: mastery.nextReviewAt,
    },
  });
})().finally(() => prisma.$disconnect());
NODE

setsid pnpm start --hostname 127.0.0.1 --port "${PORT}" \
  >/tmp/jplearn-batch6-next.log 2>&1 &
server_pid=$!
trap 'kill -TERM -- "-${server_pid}" 2>/dev/null || true; rm -f "${DB_PATH}" "${DB_PATH}-journal"' EXIT

for _ in $(seq 1 40); do
  curl -fsS "${BASE_URL}/" >/dev/null 2>&1 && break
  sleep 0.5
done
curl -fsS "${BASE_URL}/" >/dev/null

token="$(
  node -e '
    const crypto = require("node:crypto");
    const expiresAt = Date.now() + 86400000;
    const nonce = crypto.randomBytes(16).toString("base64url");
    const payload = `${expiresAt}.${nonce}`;
    const signature = crypto.createHmac("sha256", process.env.SESSION_SECRET)
      .update(payload).digest("base64url");
    process.stdout.write(`${payload}.${signature}`);
  '
)"
cookie="jplearn_session=${token}"

curl -fsS -b "${cookie}" "${BASE_URL}/api/vocabulary/dashboard" \
  >/tmp/jplearn-batch6-dashboard.json
node -e '
  const body = require("/tmp/jplearn-batch6-dashboard.json");
  if (!body.ok || body.dashboard?.reviewToday?.remaining !== 1) process.exit(1);
'

curl -fsS -b "${cookie}" -H 'Content-Type: application/json' \
  -d '{"sessionType":"REVIEW"}' \
  "${BASE_URL}/api/vocabulary/sessions" >/tmp/jplearn-batch6-session.json
curl -fsS -b "${cookie}" "${BASE_URL}/api/vocabulary/review/next" \
  >/tmp/jplearn-batch6-question.json

question_id="$(
  node -e '
    const body = require("/tmp/jplearn-batch6-question.json");
    if (!body.ok || body.done || !body.question?.questionId) process.exit(1);
    process.stdout.write(body.question.questionId);
  '
)"
accepted_answer="$(
  node -e '
    const { PrismaClient } = require("@prisma/client");
    const prisma = new PrismaClient();
    prisma.vocabularyQuestion.findUnique({ where: { id: process.argv[1] } })
      .then((question) => process.stdout.write(JSON.parse(question.acceptedAnswersJson)[0]))
      .finally(() => prisma.$disconnect());
  ' "${question_id}"
)"
attempt_body="$(
  QUESTION_ID="${question_id}" ANSWER="${accepted_answer}" node -e '
    process.stdout.write(JSON.stringify({
      questionId: process.env.QUESTION_ID,
      answer: process.env.ANSWER,
      usedHint: false,
      responseTimeMs: 1000,
    }));
  '
)"
curl -fsS -b "${cookie}" -H 'Content-Type: application/json' \
  -d "${attempt_body}" \
  "${BASE_URL}/api/vocabulary/attempts" >/tmp/jplearn-batch6-attempt.json
node -e '
  const body = require("/tmp/jplearn-batch6-attempt.json");
  if (!body.ok || body.result?.isCorrect !== true || body.result?.sessionComplete !== true) {
    process.exit(1);
  }
'

curl -fsS -b "${cookie}" \
  "${BASE_URL}/api/vocabulary/wrong?days=7&errorType=KANA_SPELLING" \
  >/tmp/jplearn-batch6-wrong.json
node -e '
  const body = require("/tmp/jplearn-batch6-wrong.json");
  if (!body.ok || body.total !== 1 || body.items?.[0]?.errorCount !== 1) process.exit(1);
'

curl -fsS -b "${cookie}" -H 'Content-Type: application/json' \
  -d '{"sessionType":"WRONG_BOOK","days":7,"errorType":"KANA_SPELLING"}' \
  "${BASE_URL}/api/vocabulary/sessions" >/tmp/jplearn-batch6-wrong-session.json
curl -fsS -b "${cookie}" \
  "${BASE_URL}/api/vocabulary/review/next?sessionType=WRONG_BOOK" \
  >/tmp/jplearn-batch6-wrong-question.json
node -e '
  const body = require("/tmp/jplearn-batch6-wrong-question.json");
  if (!body.ok || body.done || !body.question?.questionId) process.exit(1);
'

echo "BATCH6_SMOKE_OK"

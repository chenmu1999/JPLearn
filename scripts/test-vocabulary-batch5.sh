#!/usr/bin/env bash

set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-${HOME}/JPLearn-vocab}"
PORT="${PORT:-$((3100 + ($$ % 500)))}"
BASE_URL="http://127.0.0.1:${PORT}"
DATABASE_URL="${DATABASE_URL:-file:/tmp/jplearn-vocabulary-batch5-$$.db}"
SESSION_SECRET="${SESSION_SECRET:-batch5-smoke-session-secret-20260626}"
DB_PATH="${DATABASE_URL#file:}"

cd "${PROJECT_DIR}"
export DATABASE_URL SESSION_SECRET

rm -f "${DB_PATH}" "${DB_PATH}-journal"

pnpm exec prisma migrate deploy >/tmp/jplearn-batch5-migrate.log
pnpm db:seed >/tmp/jplearn-batch5-seed.log
pnpm db:import:n5 >/tmp/jplearn-batch5-import.log

setsid pnpm start --hostname 127.0.0.1 --port "${PORT}" \
  >/tmp/jplearn-batch5-next.log 2>&1 &
server_pid=$!
trap 'kill -TERM -- "-${server_pid}" 2>/dev/null || true; rm -f "${DB_PATH}" "${DB_PATH}-journal"' EXIT

for _ in $(seq 1 40); do
  if curl -fsS "${BASE_URL}/" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

if ! curl -fsS "${BASE_URL}/" >/dev/null 2>&1; then
  echo "SERVER_NOT_READY"
  tail -n 50 /tmp/jplearn-batch5-next.log
  exit 1
fi

token="$(
  node -e '
    const crypto = require("node:crypto");
    const secret = process.env.SESSION_SECRET;
    const expiresAt = Date.now() + 86400000;
    const nonce = crypto.randomBytes(16).toString("base64url");
    const payload = `${expiresAt}.${nonce}`;
    const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
    process.stdout.write(`${payload}.${signature}`);
  '
)"
cookie="jplearn_session=${token}"

session_status="$(
  curl -sS -o /tmp/jplearn-batch5-session.json -w '%{http_code}' \
    -b "${cookie}" \
    -H 'Content-Type: application/json' \
    -d '{"sessionType":"LEARN"}' \
    "${BASE_URL}/api/vocabulary/sessions"
)"
test "${session_status}" = "200"

learn_status="$(
  curl -sS -o /tmp/jplearn-batch5-question.json -w '%{http_code}' \
    -b "${cookie}" \
    "${BASE_URL}/api/vocabulary/learn/next"
)"
test "${learn_status}" = "200"

question_id="$(
  node -e '
    const body = require("/tmp/jplearn-batch5-question.json");
    if (!body.ok || body.done || !body.question?.questionId) process.exit(1);
    process.stdout.write(body.question.questionId);
  '
)"

accepted_answer="$(
  node -e '
    const { PrismaClient } = require("@prisma/client");
    const prisma = new PrismaClient();
    prisma.vocabularyQuestion.findUnique({ where: { id: process.argv[1] } })
      .then((question) => {
        if (!question) process.exitCode = 1;
        else process.stdout.write(JSON.parse(question.acceptedAnswersJson)[0]);
      })
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

attempt_status="$(
  curl -sS -o /tmp/jplearn-batch5-attempt.json -w '%{http_code}' \
    -b "${cookie}" \
    -H 'Content-Type: application/json' \
    -d "${attempt_body}" \
    "${BASE_URL}/api/vocabulary/attempts"
)"
test "${attempt_status}" = "200"
node -e '
  const body = require("/tmp/jplearn-batch5-attempt.json");
  if (!body.ok || body.result?.isCorrect !== true) process.exit(1);
'

duplicate_status="$(
  curl -sS -o /tmp/jplearn-batch5-duplicate.json -w '%{http_code}' \
    -b "${cookie}" \
    -H 'Content-Type: application/json' \
    -d "${attempt_body}" \
    "${BASE_URL}/api/vocabulary/attempts"
)"
test "${duplicate_status}" = "409"

get_question() {
  curl -fsS -b "${cookie}" "${BASE_URL}/api/vocabulary/learn/next" \
    > /tmp/jplearn-batch5-question.json
}

question_field() {
  node -e '
    const body = require("/tmp/jplearn-batch5-question.json");
    const value = process.argv[1].split(".").reduce((current, key) => current?.[key], body);
    if (value === undefined || value === null) process.exit(1);
    process.stdout.write(String(value));
  ' "$1"
}

submit_current_question() {
  local answer="$1"
  local current_question_id
  current_question_id="$(question_field question.questionId)"
  local body
  body="$(
    QUESTION_ID="${current_question_id}" ANSWER="${answer}" node -e '
      process.stdout.write(JSON.stringify({
        questionId: process.env.QUESTION_ID,
        answer: process.env.ANSWER,
        usedHint: false,
        responseTimeMs: 1000,
      }));
    '
  )"
  curl -fsS -b "${cookie}" \
    -H 'Content-Type: application/json' \
    -d "${body}" \
    "${BASE_URL}/api/vocabulary/attempts"
}

accepted_for_current_question() {
  local current_question_id
  current_question_id="$(question_field question.questionId)"
  node -e '
    const { PrismaClient } = require("@prisma/client");
    const prisma = new PrismaClient();
    prisma.vocabularyQuestion.findUnique({ where: { id: process.argv[1] } })
      .then((question) => process.stdout.write(JSON.parse(question.acceptedAnswersJson)[0]))
      .finally(() => prisma.$disconnect());
  ' "${current_question_id}"
}

# Wrong-answer retry must return after three other completed questions.
get_question
wrong_vocabulary_id="$(question_field card.id)"
submit_current_question "__definitely_wrong__" >/tmp/jplearn-batch5-wrong.json
node -e '
  const body = require("/tmp/jplearn-batch5-wrong.json");
  if (!body.ok || body.result?.isCorrect !== false) process.exit(1);
'

for _ in 1 2 3; do
  get_question
  submit_current_question "$(accepted_for_current_question)" \
    >/tmp/jplearn-batch5-correct.json
done

get_question
retry_vocabulary_id="$(question_field card.id)"
test "${retry_vocabulary_id}" = "${wrong_vocabulary_id}"

echo "BATCH5_SMOKE_OK"

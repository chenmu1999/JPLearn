import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { authenticate } from "@/lib/vocabulary/api-helpers";
import { QuizError, submitAttempt } from "@/lib/vocabulary/study-session-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  questionId: z.string().min(1).max(64),
  answer: z.string().trim().min(1).max(200),
  usedHint: z.boolean().default(false),
  responseTimeMs: z.number().int().nonnegative().max(300_000).nullable().default(null),
});

export async function POST(request: NextRequest) {
  const auth = authenticate(request);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, code: "INVALID_JSON", message: "请求格式不是有效 JSON。" },
      { status: 400 },
    );
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, code: "INVALID_INPUT", message: "提交参数无效。" },
      { status: 400 },
    );
  }

  try {
    const result = await submitAttempt({
      questionId: parsed.data.questionId,
      userId: auth.userId,
      userAnswer: parsed.data.answer,
      usedHint: parsed.data.usedHint,
      responseTimeMs: parsed.data.responseTimeMs,
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    if (error instanceof QuizError) {
      return NextResponse.json(
        { ok: false, code: error.code, message: error.message },
        { status: error.httpStatus },
      );
    }
    console.error("Submit attempt failed", error);
    return NextResponse.json(
      { ok: false, code: "SUBMIT_FAILED", message: "提交答案失败。" },
      { status: 500 },
    );
  }
}

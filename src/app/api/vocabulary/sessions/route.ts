import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { authenticate } from "@/lib/vocabulary/api-helpers";
import {
  createOrResumeLearnSession,
  createOrResumeReviewSession,
  createOrResumeWrongBookSession,
} from "@/lib/vocabulary/study-session-service";
import {
  ERROR_TYPE,
  SESSION_TYPE,
  VOCABULARY_DIMENSION,
  type VocabularyDimension,
} from "@/lib/vocabulary/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const errorTypeValues = Object.values(ERROR_TYPE) as [string, ...string[]];
const dimensionValues = Object.values(VOCABULARY_DIMENSION) as [string, ...string[]];
const bodySchema = z.discriminatedUnion("sessionType", [
  z.object({ sessionType: z.literal(SESSION_TYPE.LEARN) }),
  z.object({ sessionType: z.literal(SESSION_TYPE.REVIEW) }),
  z.object({
    sessionType: z.literal(SESSION_TYPE.WRONG_BOOK),
    days: z.union([z.literal(7), z.literal(30)]).default(7),
    errorType: z.enum(errorTypeValues).optional(),
    dimension: z.enum(dimensionValues).optional(),
  }),
]);

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
      { ok: false, code: "INVALID_INPUT", message: "学习会话参数无效。" },
      { status: 400 },
    );
  }

  try {
    const session =
      parsed.data.sessionType === SESSION_TYPE.LEARN
        ? await createOrResumeLearnSession(auth.userId)
        : parsed.data.sessionType === SESSION_TYPE.REVIEW
          ? await createOrResumeReviewSession(auth.userId)
          : await createOrResumeWrongBookSession(auth.userId, {
              days: parsed.data.days,
              errorType: parsed.data.errorType,
              dimension: parsed.data.dimension as VocabularyDimension | undefined,
            });
    return NextResponse.json({ ok: true, session });
  } catch (error) {
    console.error("Create session failed", error);
    return NextResponse.json(
      { ok: false, code: "CREATE_FAILED", message: "学习会话创建失败。" },
      { status: 500 },
    );
  }
}

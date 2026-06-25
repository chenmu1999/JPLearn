import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { authenticate } from "@/lib/vocabulary/api-helpers";
import { createOrResumeLearnSession } from "@/lib/vocabulary/study-session-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  sessionType: z.literal("LEARN"),
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
      { ok: false, code: "INVALID_INPUT", message: "目前仅支持 LEARN 会话类型。" },
      { status: 400 },
    );
  }

  try {
    const session = await createOrResumeLearnSession(auth.userId);
    return NextResponse.json({ ok: true, session });
  } catch (error) {
    console.error("Create session failed", error);
    return NextResponse.json(
      { ok: false, code: "CREATE_FAILED", message: "学习会话创建失败。" },
      { status: 500 },
    );
  }
}

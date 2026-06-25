import { NextRequest, NextResponse } from "next/server";

import { authenticate } from "@/lib/vocabulary/api-helpers";
import { abandonSession, QuizError } from "@/lib/vocabulary/study-session-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = authenticate(request);
  if (!auth.ok) return auth.response;

  const { id: sessionId } = await params;
  if (!sessionId) {
    return NextResponse.json(
      { ok: false, code: "INVALID_INPUT", message: "缺少会话 ID。" },
      { status: 400 },
    );
  }

  try {
    await abandonSession(sessionId, auth.userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof QuizError) {
      return NextResponse.json(
        { ok: false, code: error.code, message: error.message },
        { status: error.httpStatus },
      );
    }
    console.error("Abandon session failed", error);
    return NextResponse.json(
      { ok: false, code: "ABANDON_FAILED", message: "放弃会话失败。" },
      { status: 500 },
    );
  }
}

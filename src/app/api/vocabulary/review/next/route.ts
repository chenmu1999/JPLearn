import { NextRequest, NextResponse } from "next/server";

import { authenticate } from "@/lib/vocabulary/api-helpers";
import { getAndIssueNextReviewItem } from "@/lib/vocabulary/study-session-service";
import { SESSION_TYPE } from "@/lib/vocabulary/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = authenticate(request);
  if (!auth.ok) return auth.response;

  const requested = request.nextUrl.searchParams.get("sessionType");
  const sessionType =
    requested === SESSION_TYPE.WRONG_BOOK
      ? SESSION_TYPE.WRONG_BOOK
      : SESSION_TYPE.REVIEW;

  try {
    const planId = request.nextUrl.searchParams.get("planId");
    const next = await getAndIssueNextReviewItem(auth.userId, sessionType, planId);
    return NextResponse.json({ ok: true, ...next });
  } catch (error) {
    console.error("review/next failed", error);
    return NextResponse.json(
      { ok: false, code: "QUERY_FAILED", message: "复习题目加载失败。" },
      { status: 500 },
    );
  }
}

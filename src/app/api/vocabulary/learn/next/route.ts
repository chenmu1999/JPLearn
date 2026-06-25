import { NextRequest, NextResponse } from "next/server";

import { authenticate } from "@/lib/vocabulary/api-helpers";
import { getAndIssueNextLearnItem } from "@/lib/vocabulary/study-session-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = authenticate(request);
  if (!auth.ok) return auth.response;

  try {
    const next = await getAndIssueNextLearnItem(auth.userId);
    return NextResponse.json({ ok: true, ...next });
  } catch (error) {
    console.error("learn/next failed", error);
    return NextResponse.json(
      { ok: false, code: "QUERY_FAILED", message: "今日新词加载失败。" },
      { status: 500 },
    );
  }
}

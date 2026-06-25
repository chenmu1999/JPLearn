import { NextRequest, NextResponse } from "next/server";

import { authenticate } from "@/lib/vocabulary/api-helpers";
import { getDashboard } from "@/lib/vocabulary/study-plan-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = authenticate(request);
  if (!auth.ok) return auth.response;

  try {
    const dashboard = await getDashboard(auth.userId);
    return NextResponse.json({ ok: true, dashboard });
  } catch (error) {
    console.error("Dashboard query failed", error);
    return NextResponse.json(
      { ok: false, code: "QUERY_FAILED", message: "学习概览加载失败。" },
      { status: 500 },
    );
  }
}

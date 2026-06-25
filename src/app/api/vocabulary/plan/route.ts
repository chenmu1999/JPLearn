import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { authenticate } from "@/lib/vocabulary/api-helpers";
import { DAILY_NEW } from "@/lib/vocabulary/config";
import { getPlanDTO, updatePlan } from "@/lib/vocabulary/study-plan-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = authenticate(request);
  if (!auth.ok) return auth.response;

  try {
    const plan = await getPlanDTO(auth.userId);
    return NextResponse.json({ ok: true, plan });
  } catch (error) {
    console.error("Get plan failed", error);
    return NextResponse.json(
      { ok: false, code: "QUERY_FAILED", message: "学习计划加载失败。" },
      { status: 500 },
    );
  }
}

const updateSchema = z.object({
  dailyNewCount: z.number().int().min(DAILY_NEW.min).max(DAILY_NEW.max).optional(),
  timezone: z.string().min(1).max(64).optional(),
});

export async function PUT(request: NextRequest) {
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

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        code: "INVALID_INPUT",
        message: `每日新词数需在 ${DAILY_NEW.min}-${DAILY_NEW.max} 之间。`,
      },
      { status: 400 },
    );
  }

  try {
    const plan = await updatePlan(auth.userId, parsed.data);
    return NextResponse.json({ ok: true, plan });
  } catch (error) {
    console.error("Update plan failed", error);
    return NextResponse.json(
      { ok: false, code: "UPDATE_FAILED", message: "学习计划更新失败。" },
      { status: 500 },
    );
  }
}

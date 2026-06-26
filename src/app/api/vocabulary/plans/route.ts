import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { authenticate } from "@/lib/vocabulary/api-helpers";
import { VOCABULARY_LEVELS } from "@/lib/vocabulary/config";
import { createPlan, listPlanDTOs } from "@/lib/vocabulary/study-plan-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const levelValues = VOCABULARY_LEVELS as readonly string[];

const createSchema = z
  .object({
    level: z.enum(levelValues as [string, ...string[]]),
    mode: z.enum(["BY_END_DATE", "BY_DAILY"]),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "结束日期格式应为 YYYY-MM-DD")
      .optional(),
    dailyCount: z.number().int().min(1).max(500).optional(),
    name: z.string().max(40).optional(),
    timezone: z.string().min(1).max(64).optional(),
  })
  .refine((d) => (d.mode === "BY_END_DATE" ? !!d.endDate : typeof d.dailyCount === "number"), {
    message: "请提供结束日期或每日词数。",
  });

export async function GET(request: NextRequest) {
  const auth = authenticate(request);
  if (!auth.ok) return auth.response;

  try {
    const plans = await listPlanDTOs(auth.userId);
    return NextResponse.json({ ok: true, plans });
  } catch (error) {
    console.error("List plans failed", error);
    return NextResponse.json(
      { ok: false, code: "QUERY_FAILED", message: "学习计划加载失败。" },
      { status: 500 },
    );
  }
}

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

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, code: "INVALID_INPUT", message: parsed.error.issues[0]?.message ?? "计划参数无效。" },
      { status: 400 },
    );
  }

  try {
    const plan = await createPlan(auth.userId, parsed.data);
    return NextResponse.json({ ok: true, plan }, { status: 201 });
  } catch (error) {
    console.error("Create plan failed", error);
    return NextResponse.json(
      { ok: false, code: "CREATE_FAILED", message: "学习计划创建失败。" },
      { status: 500 },
    );
  }
}

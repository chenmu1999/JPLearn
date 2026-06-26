import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { authenticate } from "@/lib/vocabulary/api-helpers";
import { archivePlan, getPlanDTOById, updatePlanById } from "@/lib/vocabulary/study-plan-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateSchema = z.object({
  name: z.string().max(40).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dailyCount: z.number().int().min(1).max(500).optional(),
  status: z.enum(["ACTIVE", "COMPLETED", "ARCHIVED"]).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = authenticate(request);
  if (!auth.ok) return auth.response;
  const { id } = await params;

  try {
    const plan = await getPlanDTOById(auth.userId, id);
    if (!plan) {
      return NextResponse.json(
        { ok: false, code: "NOT_FOUND", message: "未找到该计划。" },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, plan });
  } catch (error) {
    console.error("Get plan failed", error);
    return NextResponse.json(
      { ok: false, code: "QUERY_FAILED", message: "学习计划加载失败。" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = authenticate(request);
  if (!auth.ok) return auth.response;
  const { id } = await params;

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
      { ok: false, code: "INVALID_INPUT", message: "计划参数无效。" },
      { status: 400 },
    );
  }

  try {
    const plan = await updatePlanById(auth.userId, id, parsed.data);
    if (!plan) {
      return NextResponse.json(
        { ok: false, code: "NOT_FOUND", message: "未找到该计划。" },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, plan });
  } catch (error) {
    console.error("Update plan failed", error);
    return NextResponse.json(
      { ok: false, code: "UPDATE_FAILED", message: "学习计划更新失败。" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = authenticate(request);
  if (!auth.ok) return auth.response;
  const { id } = await params;

  try {
    const ok = await archivePlan(auth.userId, id);
    if (!ok) {
      return NextResponse.json(
        { ok: false, code: "NOT_FOUND", message: "未找到该计划。" },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Archive plan failed", error);
    return NextResponse.json(
      { ok: false, code: "DELETE_FAILED", message: "学习计划删除失败。" },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";

import { getSessionUserId } from "@/lib/auth/session";
import { getVocabularyDetail } from "@/lib/vocabulary/vocabulary-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let userId: string | null;
  try {
    userId = getSessionUserId(request);
  } catch (error) {
    console.error("Vocabulary auth configuration error", error);
    return NextResponse.json(
      { ok: false, code: "AUTH_NOT_CONFIGURED", message: "登录功能尚未配置。" },
      { status: 503 },
    );
  }

  if (!userId) {
    return NextResponse.json(
      { ok: false, code: "UNAUTHORIZED", message: "请先登录后再查看单词详情。" },
      { status: 401 },
    );
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json(
      { ok: false, code: "INVALID_ID", message: "缺少单词标识。" },
      { status: 400 },
    );
  }

  try {
    const detail = await getVocabularyDetail(id, userId);
    if (!detail) {
      return NextResponse.json(
        { ok: false, code: "NOT_FOUND", message: "未找到该单词。" },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, item: detail });
  } catch (error) {
    console.error("Vocabulary detail query failed", error);
    return NextResponse.json(
      { ok: false, code: "QUERY_FAILED", message: "单词详情加载失败。" },
      { status: 500 },
    );
  }
}

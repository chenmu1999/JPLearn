import { NextRequest, NextResponse } from "next/server";

import { authenticate } from "@/lib/vocabulary/api-helpers";
import { getVocabularyDetail } from "@/lib/vocabulary/vocabulary-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = authenticate(request);
  if (!auth.ok) return auth.response;
  const userId = auth.userId;

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

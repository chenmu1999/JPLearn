import { NextRequest, NextResponse } from "next/server";

import { authenticate } from "@/lib/vocabulary/api-helpers";
import {
  PAGINATION,
  VOCABULARY_SORT_VALUES,
  type VocabularySort,
} from "@/lib/vocabulary/config";
import { listVocabulary } from "@/lib/vocabulary/vocabulary-repository";
import { VOCABULARY_STATUS_VALUES, type VocabularyStatus } from "@/lib/vocabulary/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parsePositiveInt(value: string | null, fallback: number): number {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export async function GET(request: NextRequest) {
  const auth = authenticate(request);
  if (!auth.ok) return auth.response;
  const userId = auth.userId;

  const sp = request.nextUrl.searchParams;
  const page = parsePositiveInt(sp.get("page"), 1);
  const pageSize = Math.min(
    parsePositiveInt(sp.get("pageSize"), PAGINATION.defaultPageSize),
    PAGINATION.maxPageSize,
  );

  const q = sp.get("q")?.trim() || undefined;
  const partOfSpeech = sp.get("partOfSpeech")?.trim() || undefined;
  const category = sp.get("category")?.trim() || undefined;
  const level = sp.get("level")?.trim() || undefined;

  const statusParam = sp.get("status")?.trim();
  const status =
    statusParam && VOCABULARY_STATUS_VALUES.includes(statusParam)
      ? (statusParam as VocabularyStatus)
      : undefined;

  const sortParam = sp.get("sort")?.trim();
  const sort =
    sortParam && VOCABULARY_SORT_VALUES.includes(sortParam)
      ? (sortParam as VocabularySort)
      : undefined;

  try {
    const result = await listVocabulary(
      { page, pageSize, q, status, partOfSpeech, category, level, sort },
      userId,
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Vocabulary list query failed", error);
    return NextResponse.json(
      { ok: false, code: "QUERY_FAILED", message: "单词列表加载失败。" },
      { status: 500 },
    );
  }
}

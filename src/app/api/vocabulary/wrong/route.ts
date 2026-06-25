import { NextRequest, NextResponse } from "next/server";

import { authenticate } from "@/lib/vocabulary/api-helpers";
import { listWrongVocabulary } from "@/lib/vocabulary/wrong-book-service";
import {
  ERROR_TYPE,
  VOCABULARY_DIMENSION,
  type ErrorType,
  type VocabularyDimension,
} from "@/lib/vocabulary/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const errorTypes = new Set<string>(Object.values(ERROR_TYPE));
const dimensions = new Set<string>(Object.values(VOCABULARY_DIMENSION));

export async function GET(request: NextRequest) {
  const auth = authenticate(request);
  if (!auth.ok) return auth.response;

  const days = request.nextUrl.searchParams.get("days") === "30" ? 30 : 7;
  const rawErrorType = request.nextUrl.searchParams.get("errorType");
  const rawDimension = request.nextUrl.searchParams.get("dimension");
  const errorType = rawErrorType && errorTypes.has(rawErrorType)
    ? rawErrorType as ErrorType
    : undefined;
  const dimension = rawDimension && dimensions.has(rawDimension)
    ? rawDimension as VocabularyDimension
    : undefined;

  try {
    const result = await listWrongVocabulary(auth.userId, {
      days,
      errorType,
      dimension,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("wrong book query failed", error);
    return NextResponse.json(
      { ok: false, code: "QUERY_FAILED", message: "错词本加载失败。" },
      { status: 500 },
    );
  }
}

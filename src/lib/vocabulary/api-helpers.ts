import "server-only";

import { NextRequest, NextResponse } from "next/server";

import { getSessionUserId } from "@/lib/auth/session";

export type AuthResult =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse };

/** Resolve the authenticated user or a ready-to-return error response. */
export function authenticate(request: NextRequest): AuthResult {
  let userId: string | null;
  try {
    userId = getSessionUserId(request);
  } catch (error) {
    console.error("Vocabulary auth configuration error", error);
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, code: "AUTH_NOT_CONFIGURED", message: "登录功能尚未配置。" },
        { status: 503 },
      ),
    };
  }
  if (!userId) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, code: "UNAUTHORIZED", message: "请先登录。" },
        { status: 401 },
      ),
    };
  }
  return { ok: true, userId };
}

import { NextRequest, NextResponse } from "next/server";

import {
  setSessionCookie,
  verifyLoginPassword,
} from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LOGIN_ATTEMPTS = 8;
const LOGIN_WINDOW_MS = 10 * 60_000;

type LoginAttempt = {
  count: number;
  resetAt: number;
};

const globalForLoginLimit = globalThis as typeof globalThis & {
  jplearnLoginAttempts?: Map<string, LoginAttempt>;
};

const loginAttempts =
  globalForLoginLimit.jplearnLoginAttempts ??
  (globalForLoginLimit.jplearnLoginAttempts = new Map());

function getClientId(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function registerAttempt(clientId: string): boolean {
  const now = Date.now();
  const attempt = loginAttempts.get(clientId);

  if (!attempt || attempt.resetAt <= now) {
    loginAttempts.set(clientId, {
      count: 1,
      resetAt: now + LOGIN_WINDOW_MS,
    });
    return false;
  }

  attempt.count += 1;
  return attempt.count > MAX_LOGIN_ATTEMPTS;
}

export async function POST(request: NextRequest) {
  const clientId = getClientId(request);

  if (registerAttempt(clientId)) {
    return NextResponse.json(
      {
        ok: false,
        message: "登录尝试过多，请稍后再试。",
      },
      { status: 429 },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "请求格式错误。" },
      { status: 400 },
    );
  }

  const password =
    typeof body === "object" &&
    body !== null &&
    "password" in body &&
    typeof body.password === "string"
      ? body.password
      : "";

  try {
    if (!password || !verifyLoginPassword(password)) {
      return NextResponse.json(
        { ok: false, message: "密码不正确。" },
        { status: 401 },
      );
    }

    loginAttempts.delete(clientId);
    const response = NextResponse.json({ ok: true });
    setSessionCookie(response);
    return response;
  } catch (error) {
    console.error("Login configuration error", error);
    return NextResponse.json(
      { ok: false, message: "登录功能尚未配置。" },
      { status: 503 },
    );
  }
}


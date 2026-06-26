import "server-only";

import {
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import type { NextRequest, NextResponse } from "next/server";

import { LOCAL_USER_ID } from "@/lib/vocabulary/config";

export const SESSION_COOKIE_NAME = "jplearn_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET?.trim();

  if (!secret || secret.length < 32) {
    throw new Error("登录功能尚未配置，请设置至少 32 字符的 SESSION_SECRET。");
  }

  return secret;
}

function sign(value: string): string {
  return createHmac("sha256", getSessionSecret())
    .update(value)
    .digest("base64url");
}

function safelyEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function createSessionToken(): string {
  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  const payload = `${expiresAt}.${randomBytes(16).toString("base64url")}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined): boolean {
  if (!token) {
    return false;
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    return false;
  }

  const [expiresAtText, nonce, signature] = parts;
  const payload = `${expiresAtText}.${nonce}`;
  const expiresAt = Number(expiresAtText);

  return (
    Number.isFinite(expiresAt) &&
    expiresAt > Date.now() &&
    safelyEqual(signature, sign(payload))
  );
}

export function isAuthenticated(request: NextRequest): boolean {
  return verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
}

/**
 * Resolve the current user id for an authenticated request. First version is
 * single-user, so this returns the seeded local user when the session is valid,
 * otherwise null. May throw if the session secret is not configured; callers
 * should treat that as "not configured".
 */
export function getSessionUserId(request: NextRequest): string | null {
  return isAuthenticated(request) ? LOCAL_USER_ID : null;
}

/**
 * The `Secure` cookie attribute is only honored by browsers over HTTPS. Basing
 * it on NODE_ENV alone breaks plain-HTTP deployments (e.g. intranet testing),
 * where a production build serves over http:// and the browser then silently
 * drops the session cookie. Instead, mark the cookie Secure only when the
 * request actually arrived over HTTPS (directly or via a TLS-terminating proxy).
 */
function isRequestSecure(request?: NextRequest): boolean {
  if (!request) {
    return process.env.NODE_ENV === "production";
  }

  const forwardedProto = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();

  if (forwardedProto) {
    return forwardedProto === "https";
  }

  return request.nextUrl.protocol === "https:";
}

export function setSessionCookie(
  response: NextResponse,
  request?: NextRequest,
): void {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: createSessionToken(),
    httpOnly: true,
    secure: isRequestSecure(request),
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });
}

export function clearSessionCookie(
  response: NextResponse,
  request?: NextRequest,
): void {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: isRequestSecure(request),
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
}


import { NextRequest, NextResponse } from "next/server";

import { clearSessionCookie } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: NextRequest) {
  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response, request);
  return response;
}


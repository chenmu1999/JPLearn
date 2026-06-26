import { NextRequest, NextResponse } from "next/server";

import { isAuthenticated } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  try {
    return NextResponse.json({ authenticated: isAuthenticated(request) });
  } catch (error) {
    console.error("Session configuration error", error);
    return NextResponse.json(
      { authenticated: false, message: "登录功能尚未配置。" },
      { status: 503 },
    );
  }
}

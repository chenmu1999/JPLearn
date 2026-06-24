import { NextResponse } from "next/server";

import {
  AiConfigurationError,
  AiProviderError,
  AiResponseError,
  getAiConfigStatus,
  getAiVerifyToken,
  verifyAiConnection,
} from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(getAiConfigStatus());
}

export async function POST(request: Request) {
  try {
    const expectedToken = getAiVerifyToken();
    const suppliedToken = request.headers.get("x-ai-verify-token");

    if (suppliedToken !== expectedToken) {
      return NextResponse.json(
        { ok: false, code: "UNAUTHORIZED", message: "验证令牌无效。" },
        { status: 401 },
      );
    }

    return NextResponse.json(await verifyAiConnection());
  } catch (error) {
    if (error instanceof AiConfigurationError) {
      return NextResponse.json(
        { ok: false, code: "AI_NOT_CONFIGURED", message: error.message },
        { status: 503 },
      );
    }

    if (error instanceof AiProviderError) {
      console.error("DeepSeek API verification failed", {
        status: error.status,
        code: error.code,
        requestId: error.requestId,
      });

      return NextResponse.json(
        {
          ok: false,
          code: "AI_PROVIDER_ERROR",
          message: "DeepSeek API 调用失败，请检查密钥、余额、模型和网络配置。",
          providerStatus: error.status ?? null,
          requestId: error.requestId,
        },
        { status: 502 },
      );
    }

    if (error instanceof AiResponseError) {
      return NextResponse.json(
        {
          ok: false,
          code: "AI_INVALID_RESPONSE",
          message: error.message,
        },
        { status: 502 },
      );
    }

    console.error("Unexpected AI verification error", error);

    return NextResponse.json(
      {
        ok: false,
        code: "AI_VERIFICATION_FAILED",
        message: "AI 连接验证失败。",
      },
      { status: 500 },
    );
  }
}

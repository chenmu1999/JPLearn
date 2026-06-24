import OpenAI from "openai";

export class AiResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiResponseError";
  }
}

export class AiProviderError extends Error {
  readonly status: number | null;
  readonly code: string | null;
  readonly requestId: string | null;

  constructor(
    message: string,
    details: {
      status?: number | null;
      code?: string | null;
      requestId?: string | null;
      cause?: unknown;
    } = {},
  ) {
    super(message, { cause: details.cause });
    this.name = "AiProviderError";
    this.status = details.status ?? null;
    this.code = details.code ?? null;
    this.requestId = details.requestId ?? null;
  }
}

export function normalizeAiError(error: unknown): Error {
  if (error instanceof AiResponseError || error instanceof AiProviderError) {
    return error;
  }

  if (error instanceof OpenAI.APIError) {
    return new AiProviderError("AI 服务调用失败。", {
      status: error.status,
      code: error.code,
      requestId: error.requestID,
      cause: error,
    });
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error("未知 AI 调用错误。", { cause: error });
}


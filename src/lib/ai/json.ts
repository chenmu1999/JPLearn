import { AiResponseError, normalizeAiError } from "./errors";

export type JsonObject = Record<string, unknown>;

export function parseJsonObject(content: string): JsonObject {
  const normalized = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  try {
    const parsed: unknown = JSON.parse(normalized);

    if (!isJsonObject(parsed)) {
      throw new AiResponseError("AI 返回的 JSON 顶层必须是对象。");
    }

    return parsed;
  } catch (error) {
    if (error instanceof AiResponseError) {
      throw error;
    }

    throw new AiResponseError("AI 返回内容不是有效 JSON。");
  }
}

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function requireString(
  object: JsonObject,
  key: string,
  context: string,
): string {
  const value = object[key];

  if (typeof value !== "string" || !value.trim()) {
    throw new AiResponseError(`${context}.${key} 必须是非空字符串。`);
  }

  return value.trim();
}

export async function withNormalizedAiErrors<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw normalizeAiError(error);
  }
}


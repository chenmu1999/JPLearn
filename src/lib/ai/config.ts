const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-v4-flash";

export type AiConfig = {
  apiKey: string;
  baseURL: string;
  model: string;
};

export class AiConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiConfigurationError";
  }
}

export function getAiConfig(): AiConfig {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new AiConfigurationError(
      "AI 功能尚未配置，请设置 OPENAI_API_KEY。",
    );
  }

  return {
    apiKey,
    baseURL: process.env.OPENAI_BASE_URL?.trim() || DEFAULT_BASE_URL,
    model: process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL,
  };
}

export function getAiConfigStatus() {
  return {
    configured: Boolean(process.env.OPENAI_API_KEY?.trim()),
    baseURL: process.env.OPENAI_BASE_URL?.trim() || DEFAULT_BASE_URL,
    model: process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL,
  };
}

export function getAiVerifyToken(): string {
  const token = process.env.AI_VERIFY_TOKEN?.trim();

  if (!token) {
    throw new AiConfigurationError(
      "AI 验证接口尚未配置，请设置 AI_VERIFY_TOKEN。",
    );
  }

  return token;
}

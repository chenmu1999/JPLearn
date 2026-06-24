import { createJsonCompletion } from "./completion";

export type AiVerificationResult = {
  ok: true;
  model: string;
  response: string;
  usage: {
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
  };
};

export async function verifyAiConnection(
  prompt = '只回复 JSON：{"status":"ok"}',
): Promise<AiVerificationResult> {
  const { data, model, rawContent: response } = await createJsonCompletion({
    system: "You are a connectivity check. Return concise JSON and no markdown.",
    user: prompt,
    maxTokens: 64,
  });

  if (data.status !== "ok") {
    throw new Error("AI API 已响应，但连接验证内容不符合预期。");
  }

  return {
    ok: true,
    model,
    response,
    usage: {
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
    },
  };
}

import { getAiClient } from "./client";
import { getAiConfig } from "./config";
import { AiResponseError } from "./errors";
import { parseJsonObject, type JsonObject, withNormalizedAiErrors } from "./json";

type JsonCompletionInput = {
  system: string;
  user: string;
  maxTokens: number;
};

export async function createJsonCompletion({
  system,
  user,
  maxTokens,
}: JsonCompletionInput): Promise<{
  data: JsonObject;
  model: string;
  rawContent: string;
}> {
  return withNormalizedAiErrors(async () => {
    const { model } = getAiConfig();
    const client = getAiClient();
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
      max_tokens: maxTokens,
      stream: false,
    });
    const rawContent = completion.choices[0]?.message.content?.trim();

    if (!rawContent) {
      throw new AiResponseError("AI API 返回成功，但响应内容为空。");
    }

    return {
      data: parseJsonObject(rawContent),
      model: completion.model || model,
      rawContent,
    };
  });
}


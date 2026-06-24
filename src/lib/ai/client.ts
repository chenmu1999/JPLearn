import OpenAI from "openai";

import { getAiConfig } from "./config";

let cachedClient: OpenAI | undefined;
let cachedSignature: string | undefined;

export function getAiClient(): OpenAI {
  const config = getAiConfig();
  const signature = `${config.baseURL}\u0000${config.apiKey}`;

  if (!cachedClient || cachedSignature !== signature) {
    cachedClient = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      maxRetries: 1,
      timeout: 30_000,
    });
    cachedSignature = signature;
  }

  return cachedClient;
}


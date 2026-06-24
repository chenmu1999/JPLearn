import { createJsonCompletion } from "./completion";
import { AiResponseError } from "./errors";
import { isJsonObject, requireString } from "./json";
import type {
  GeneratedExample,
  GenerateExamplesInput,
  KnowledgePointForAi,
} from "./types";

const DEFAULT_EXAMPLE_COUNT = 5;
const MAX_EXAMPLE_COUNT = 10;

function describeKnowledgePoint(point: KnowledgePointForAi): string {
  return JSON.stringify(
    {
      id: point.id,
      kind: point.kind,
      title: point.title,
      reading: point.reading ?? null,
      meaningZh: point.meaningZh ?? null,
      category: point.category ?? null,
      partOfSpeechZh: point.partOfSpeechZh ?? null,
      pattern: point.pattern ?? null,
      sourceExample: point.sourceExample ?? null,
      note: point.note ?? null,
    },
    null,
    2,
  );
}

export async function generateExamples({
  knowledgePoint,
  count = DEFAULT_EXAMPLE_COUNT,
}: GenerateExamplesInput): Promise<{
  examples: GeneratedExample[];
  model: string;
}> {
  if (!knowledgePoint.id.trim() || !knowledgePoint.title.trim()) {
    throw new TypeError("知识点 id 和 title 不能为空。");
  }

  if (!Number.isInteger(count) || count < 1 || count > MAX_EXAMPLE_COUNT) {
    throw new RangeError(`例句数量必须是 1-${MAX_EXAMPLE_COUNT} 的整数。`);
  }

  const { data, model } = await createJsonCompletion({
    system: [
      "你是日语 JLPT N5 教师。",
      "请只输出 JSON，不要输出 Markdown。",
      "所有日语表达必须自然、简短，并限制在 N5 或接近 N5 的难度。",
      "每个日语例句必须明确包含目标词汇或语法知识点。",
      'JSON 格式：{"examples":[{"japanese":"...","chinese":"...","difficulty":"N5"}]}',
    ].join("\n"),
    user: [
      `请为以下知识点生成 ${count} 条互不重复的例句。`,
      "目标知识点：",
      describeKnowledgePoint(knowledgePoint),
    ].join("\n"),
    maxTokens: Math.max(600, count * 180),
  });

  if (!Array.isArray(data.examples) || data.examples.length !== count) {
    throw new AiResponseError(`AI 必须返回恰好 ${count} 条例句。`);
  }

  const examples = data.examples.map((value, index): GeneratedExample => {
    if (!isJsonObject(value)) {
      throw new AiResponseError(`examples[${index}] 必须是对象。`);
    }

    const difficulty = requireString(value, "difficulty", `examples[${index}]`);

    if (difficulty !== "N5") {
      throw new AiResponseError(`examples[${index}].difficulty 必须是 N5。`);
    }

    return {
      japanese: requireString(value, "japanese", `examples[${index}]`),
      chinese: requireString(value, "chinese", `examples[${index}]`),
      difficulty,
    };
  });

  return { examples, model };
}


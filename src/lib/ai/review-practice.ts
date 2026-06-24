import { createJsonCompletion } from "./completion";
import { AiResponseError } from "./errors";
import { isJsonObject, requireString } from "./json";
import type {
  KnowledgePointForAi,
  PracticeReviewItem,
  PracticeReviewResult,
  ReviewPracticeAttemptInput,
} from "./types";

function compactKnowledgePoint(point: KnowledgePointForAi) {
  return {
    id: point.id,
    kind: point.kind,
    title: point.title,
    reading: point.reading ?? null,
    meaningZh: point.meaningZh ?? null,
    pattern: point.pattern ?? null,
    note: point.note ?? null,
  };
}

export async function reviewPracticeAttempt({
  targetKnowledgePoint,
  knownKnowledgePoints = [],
  mode,
  exerciseType,
  promptText,
  answer,
}: ReviewPracticeAttemptInput): Promise<{
  review: PracticeReviewResult;
  model: string;
  rawResponse: string;
}> {
  if (!answer.trim()) {
    throw new TypeError("练习答案不能为空。");
  }

  const allowedPoints = new Map(
    [targetKnowledgePoint, ...knownKnowledgePoints].map((point) => [
      point.id,
      point,
    ]),
  );

  if (!allowedPoints.has(targetKnowledgePoint.id)) {
    throw new TypeError("目标知识点无效。");
  }

  const { data, model, rawContent } = await createJsonCompletion({
    system: [
      "你是严格但简洁的日语 JLPT N5 练习批改教师。",
      "请只输出 JSON，不要输出 Markdown。",
      "每个知识点只能判定 CORRECT 或 INCORRECT，不允许部分正确。",
      "CORRECT 的 scoreDelta 必须是 20；INCORRECT 的 scoreDelta 必须是 -10。",
      "至少返回目标知识点。只有答案明确使用或暴露问题的其他已知知识点才需要返回。",
      "不得返回给定知识点列表之外的 knowledgePointId。",
      "词汇拼写错误只影响对应词汇；语法结构正确时语法仍可判定正确。",
      "语法小错也应判定对应语法错误。",
      'JSON 格式：{"summaryZh":"...","correctedSentence":"...","reviewItems":[{"knowledgePointId":"...","status":"CORRECT","scoreDelta":20,"noteZh":"...","evidence":"..."}]}',
    ].join("\n"),
    user: JSON.stringify(
      {
        mode,
        exerciseType,
        promptText: promptText ?? null,
        answer,
        targetKnowledgePoint: compactKnowledgePoint(targetKnowledgePoint),
        knownKnowledgePoints: knownKnowledgePoints.map(compactKnowledgePoint),
      },
      null,
      2,
    ),
    maxTokens: 1400,
  });

  const summaryZh = requireString(data, "summaryZh", "review");
  const correctedSentence = requireString(data, "correctedSentence", "review");

  if (!Array.isArray(data.reviewItems) || data.reviewItems.length === 0) {
    throw new AiResponseError("review.reviewItems 必须是非空数组。");
  }

  const seenIds = new Set<string>();
  const reviewItems = data.reviewItems.map(
    (value, index): PracticeReviewItem => {
      if (!isJsonObject(value)) {
        throw new AiResponseError(`reviewItems[${index}] 必须是对象。`);
      }

      const context = `reviewItems[${index}]`;
      const knowledgePointId = requireString(
        value,
        "knowledgePointId",
        context,
      );
      const status = requireString(value, "status", context);
      const scoreDelta = value.scoreDelta;

      if (!allowedPoints.has(knowledgePointId)) {
        throw new AiResponseError(
          `${context}.knowledgePointId 不在允许的知识点列表中。`,
        );
      }

      if (seenIds.has(knowledgePointId)) {
        throw new AiResponseError(`${context}.knowledgePointId 重复。`);
      }
      seenIds.add(knowledgePointId);

      if (status !== "CORRECT" && status !== "INCORRECT") {
        throw new AiResponseError(`${context}.status 无效。`);
      }

      const expectedDelta = status === "CORRECT" ? 20 : -10;
      if (scoreDelta !== expectedDelta) {
        throw new AiResponseError(
          `${context}.scoreDelta 必须是 ${expectedDelta}。`,
        );
      }

      return {
        knowledgePointId,
        status,
        scoreDelta: expectedDelta,
        noteZh: requireString(value, "noteZh", context),
        evidence: requireString(value, "evidence", context),
      };
    },
  );

  if (!seenIds.has(targetKnowledgePoint.id)) {
    throw new AiResponseError("批改结果缺少目标知识点。");
  }

  return {
    review: { summaryZh, correctedSentence, reviewItems },
    model,
    rawResponse: rawContent,
  };
}


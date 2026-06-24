export type KnowledgePointKind = "VOCABULARY" | "GRAMMAR";

export type KnowledgePointForAi = {
  id: string;
  kind: KnowledgePointKind;
  title: string;
  reading?: string | null;
  meaningZh?: string | null;
  category?: string | null;
  partOfSpeechZh?: string | null;
  pattern?: string | null;
  sourceExample?: string | null;
  note?: string | null;
};

export type GeneratedExample = {
  japanese: string;
  chinese: string;
  difficulty: "N5";
};

export type GenerateExamplesInput = {
  knowledgePoint: KnowledgePointForAi;
  count?: number;
};

export type PracticeReviewStatus = "CORRECT" | "INCORRECT";

export type PracticeReviewItem = {
  knowledgePointId: string;
  status: PracticeReviewStatus;
  scoreDelta: 20 | -10;
  noteZh: string;
  evidence: string;
};

export type PracticeReviewResult = {
  summaryZh: string;
  correctedSentence: string;
  reviewItems: PracticeReviewItem[];
};

export type ReviewPracticeAttemptInput = {
  targetKnowledgePoint: KnowledgePointForAi;
  knownKnowledgePoints?: KnowledgePointForAi[];
  mode: "SENTENCE_WRITING" | "COMPREHENSION";
  exerciseType: string;
  promptText?: string | null;
  answer: string;
};


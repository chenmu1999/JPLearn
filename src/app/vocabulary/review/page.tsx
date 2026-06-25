import { VocabularyReviewSession } from "@/components/vocabulary/vocabulary-review-session";
import { SESSION_TYPE } from "@/lib/vocabulary/types";

export default function VocabularyReviewPage() {
  return (
    <VocabularyReviewSession
      sessionType={SESSION_TYPE.REVIEW}
      title="今日复习"
      backHref="/vocabulary"
    />
  );
}

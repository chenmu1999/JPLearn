import { VocabularyReviewSession } from "@/components/vocabulary/vocabulary-review-session";
import { SESSION_TYPE } from "@/lib/vocabulary/types";

export default async function VocabularyReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ planId?: string }>;
}) {
  const { planId } = await searchParams;
  return (
    <VocabularyReviewSession
      sessionType={SESSION_TYPE.REVIEW}
      title="今日复习"
      backHref={planId ? `/vocabulary/plans/${planId}` : "/vocabulary"}
      planId={planId}
    />
  );
}

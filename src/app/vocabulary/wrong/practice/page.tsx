import { VocabularyReviewSession } from "@/components/vocabulary/vocabulary-review-session";
import { SESSION_TYPE } from "@/lib/vocabulary/types";

export default async function WrongBookPracticePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const days = params.days === "30" ? 30 : 7;
  const errorType = typeof params.errorType === "string" ? params.errorType : undefined;
  const dimension = typeof params.dimension === "string" ? params.dimension : undefined;

  return (
    <VocabularyReviewSession
      sessionType={SESSION_TYPE.WRONG_BOOK}
      title="错词专项复习"
      backHref="/vocabulary/wrong"
      filters={{ days, errorType, dimension }}
    />
  );
}

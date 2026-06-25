import { VocabularyDetailView } from "@/components/vocabulary/vocabulary-detail";

export const metadata = {
  title: "单词详情 | JPLearn",
};

export default async function VocabularyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <main className="min-h-screen bg-[#f7f3e9] text-[#17241d]">
      <div className="mx-auto max-w-3xl px-6 py-8 sm:px-10">
        <VocabularyDetailView id={id} />
      </div>
    </main>
  );
}

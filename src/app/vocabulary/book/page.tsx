import Link from "next/link";

import { VocabularyBook } from "@/components/vocabulary/vocabulary-book";

export const metadata = {
  title: "单词本 | JPLearn",
  description: "浏览、搜索和筛选 JLPT N5 单词。",
};

export default function VocabularyBookPage() {
  return (
    <main className="min-h-screen bg-[#f7f3e9] text-[#17241d]">
      <div className="mx-auto max-w-5xl px-6 py-8 sm:px-10">
        <header className="mb-8 flex items-center justify-between border-b border-[#17241d]/15 pb-5">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#d94f3d]">
              N5 词汇
            </p>
            <h1 className="mt-1 text-3xl font-black tracking-tight">单词本</h1>
          </div>
          <Link
            href="/"
            className="rounded-full border border-[#17241d]/15 bg-white/60 px-4 py-2 text-sm font-medium"
          >
            首页
          </Link>
        </header>

        <VocabularyBook />
      </div>
    </main>
  );
}

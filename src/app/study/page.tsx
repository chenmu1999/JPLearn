"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function StudyPage() {
  const router = useRouter();
  const [grammarHint, setGrammarHint] = useState(false);

  return (
    <main className="min-h-screen bg-[#f7f3e9] text-[#17241d]">
      <div className="mx-auto flex min-h-screen max-w-xl flex-col px-6 py-8 sm:px-10">
        <header className="mb-8 flex items-center justify-between border-b border-[#17241d]/15 pb-5">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#d94f3d]">
              开始学习
            </p>
            <h1 className="mt-1 text-3xl font-black tracking-tight">选择学习内容</h1>
          </div>
          <Link
            href="/"
            className="rounded-full border border-[#17241d]/15 bg-white/60 px-4 py-2 text-sm font-medium"
          >
            首页
          </Link>
        </header>

        <div className="flex flex-1 flex-col justify-center gap-5 pb-12">
          {/* 单词：进入现有单词模块，每次都从单词模块主页打开 */}
          <button
            type="button"
            onClick={() => router.push("/vocabulary")}
            className="group flex w-full items-center justify-between rounded-3xl bg-[#24705a] px-8 py-10 text-left text-white shadow-[0_18px_50px_rgba(36,112,90,0.25)] transition active:scale-[0.98] hover:bg-[#1c5a48]"
          >
            <div>
              <p className="text-3xl font-black tracking-tight">单词</p>
              <p className="mt-2 text-sm text-white/75">背诵、复习与错词专项练习</p>
            </div>
            <span className="text-5xl font-black opacity-80 transition group-hover:translate-x-1">
              語
            </span>
          </button>

          {/* 语法：功能暂未开发 */}
          <button
            type="button"
            onClick={() => setGrammarHint(true)}
            className="group flex w-full items-center justify-between rounded-3xl border border-[#17241d]/15 bg-white/70 px-8 py-10 text-left transition active:scale-[0.98] hover:border-[#d94f3d]"
          >
            <div>
              <p className="text-3xl font-black tracking-tight">语法</p>
              <p className="mt-2 text-sm text-[#17241d]/55">句型与表达（暂未开发）</p>
            </div>
            <span className="text-5xl font-black text-[#d94f3d]/70 transition group-hover:translate-x-1">
              文
            </span>
          </button>

          {grammarHint && (
            <p className="text-center text-sm font-medium text-[#d94f3d]">
              语法模块暂未开发，敬请期待。
            </p>
          )}
        </div>
      </div>
    </main>
  );
}

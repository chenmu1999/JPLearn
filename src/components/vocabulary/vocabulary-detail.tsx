"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  FORM_TYPE,
  VOCABULARY_STATUS,
  type VocabularyDetail,
} from "@/lib/vocabulary/types";

const STATUS_LABELS: Record<string, string> = {
  [VOCABULARY_STATUS.NEW]: "未学",
  [VOCABULARY_STATUS.LEARNING]: "学习中",
  [VOCABULARY_STATUS.REVIEWING]: "复习中",
  [VOCABULARY_STATUS.MASTERED]: "已掌握",
};

const DIMENSIONS: Array<{ key: keyof VocabularyDetail["mastery"]; label: string }> = [
  { key: "readingScore", label: "读音" },
  { key: "spellingScore", label: "拼写" },
  { key: "meaningScore", label: "词义" },
  { key: "writingScore", label: "表记" },
  { key: "contextScore", label: "语境" },
];

type LoadState = "loading" | "error" | "unauthorized" | "notfound" | "ready";

export function VocabularyDetailView({ id }: { id: string }) {
  const [item, setItem] = useState<VocabularyDetail | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoadState("loading");

    fetch(`/api/vocabulary/${encodeURIComponent(id)}`, { signal: controller.signal })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (res.status === 401) return setLoadState("unauthorized");
        if (res.status === 404) return setLoadState("notfound");
        if (!res.ok || !body?.ok) {
          setErrorMessage(body?.message ?? "加载失败，请稍后重试。");
          return setLoadState("error");
        }
        setItem(body.item);
        setLoadState("ready");
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.error(error);
        setErrorMessage("网络异常，请检查连接后重试。");
        setLoadState("error");
      });

    return () => controller.abort();
  }, [id]);

  if (loadState === "loading") {
    return <p className="py-16 text-center text-[#17241d]/50">加载中…</p>;
  }
  if (loadState === "unauthorized") {
    return <p className="py-16 text-center text-[#17241d]/60">请先登录后再查看单词详情。</p>;
  }
  if (loadState === "notfound") {
    return (
      <div className="py-16 text-center text-[#17241d]/60">
        <p>未找到该单词。</p>
        <Link href="/vocabulary/book" className="mt-3 inline-block text-[#24705a] underline">
          返回单词本
        </Link>
      </div>
    );
  }
  if (loadState === "error" || !item) {
    return <p className="py-16 text-center text-[#d94f3d]">{errorMessage}</p>;
  }

  const readings = item.acceptedForms.filter((f) => f.formType === FORM_TYPE.READING);
  const writings = item.acceptedForms.filter((f) => f.formType === FORM_TYPE.WRITING);

  return (
    <article className="space-y-8">
      <header className="rounded-3xl border border-[#17241d]/10 bg-white/60 p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-4xl font-black tracking-tight">{item.primaryWriting}</h1>
          <span className="rounded-full bg-[#f0c864]/40 px-3 py-1 text-sm font-medium">
            {STATUS_LABELS[item.mastery.status] ?? item.mastery.status}
          </span>
        </div>
        <p className="mt-2 text-xl text-[#24705a]">{item.primaryReading}</p>
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-[#17241d]/50">
          <span className="rounded-full border border-[#17241d]/10 px-2 py-0.5">{item.level}</span>
          {item.partOfSpeech && (
            <span className="rounded-full border border-[#17241d]/10 px-2 py-0.5">
              {item.partOfSpeech}
            </span>
          )}
          {item.category && (
            <span className="rounded-full border border-[#17241d]/10 px-2 py-0.5">
              {item.category}
            </span>
          )}
        </div>
      </header>

      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-[#d94f3d]">释义</h2>
        <ul className="space-y-1.5">
          {item.senses.map((s) => (
            <li key={s.order} className="text-base">
              <span>{s.meaningZh}</span>
              {s.noteZh && <span className="ml-2 text-sm text-[#17241d]/50">（{s.noteZh}）</span>}
            </li>
          ))}
        </ul>
        {item.meaningEn && <p className="mt-2 text-sm text-[#17241d]/45">{item.meaningEn}</p>}
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-[#d94f3d]">
            读音
          </h2>
          <div className="flex flex-wrap gap-2">
            {readings.map((f) => (
              <span
                key={f.value}
                className={`rounded-full px-3 py-1 text-sm ${
                  f.isPrimary ? "bg-[#24705a] text-white" : "border border-[#17241d]/15"
                }`}
              >
                {f.value}
              </span>
            ))}
          </div>
        </div>
        <div>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-[#d94f3d]">
            表记
          </h2>
          <div className="flex flex-wrap gap-2">
            {writings.map((f) => (
              <span
                key={f.value}
                className={`rounded-full px-3 py-1 text-sm ${
                  f.isPrimary ? "bg-[#17241d] text-white" : "border border-[#17241d]/15"
                }`}
              >
                {f.value}
              </span>
            ))}
          </div>
        </div>
      </section>

      {item.usageNoteZh && (
        <section>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-[#d94f3d]">
            用法提示
          </h2>
          <p className="text-sm leading-7 text-[#17241d]/70">{item.usageNoteZh}</p>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-[#d94f3d]">例句</h2>
        {item.examples.length === 0 ? (
          <p className="text-sm text-[#17241d]/45">暂无例句。基础学习不依赖即时生成。</p>
        ) : (
          <ul className="space-y-3">
            {item.examples.map((e) => (
              <li key={e.id} className="rounded-2xl border border-[#17241d]/10 bg-white/55 p-4">
                <p className="text-base">{e.japanese}</p>
                {e.chinese && <p className="mt-1 text-sm text-[#17241d]/60">{e.chinese}</p>}
                {e.usageNoteZh && (
                  <p className="mt-1 text-xs text-[#17241d]/45">{e.usageNoteZh}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-[#d94f3d]">
          掌握进度
        </h2>
        <div className="grid grid-cols-5 gap-2">
          {DIMENSIONS.map((d) => (
            <div
              key={d.key}
              className="rounded-2xl border border-[#17241d]/10 bg-white/55 p-3 text-center"
            >
              <p className="text-xs text-[#17241d]/55">{d.label}</p>
              <p className="mt-1 text-lg font-bold">{item.mastery[d.key] as number}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-[#17241d]/45">
          已作答 {item.recentAttempts.total} 次
          {item.recentAttempts.lastIsCorrect !== null &&
            `，最近一次${item.recentAttempts.lastIsCorrect ? "正确" : "错误"}`}
        </p>
      </section>

      <div>
        <Link href="/vocabulary/book" className="text-sm text-[#24705a] underline">
          ← 返回单词本
        </Link>
      </div>
    </article>
  );
}

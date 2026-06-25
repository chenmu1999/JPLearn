"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type { WrongVocabularyResponse } from "@/lib/vocabulary/types";

const ERROR_OPTIONS = [
  ["", "全部错误"],
  ["KANA_SPELLING", "假名拼写"],
  ["DAKUON_HANDAKUON", "清浊音"],
  ["SMALL_KANA", "小假名"],
  ["SOKUON", "促音"],
  ["LONG_VOWEL", "长音"],
  ["MORAIC_N", "拨音"],
  ["MEANING_CONFUSION", "词义混淆"],
] as const;

const DIMENSION_OPTIONS = [
  ["", "全部能力"],
  ["reading", "读音"],
  ["spelling", "拼写"],
  ["meaning", "词义"],
] as const;

export function VocabularyWrongBook() {
  const [days, setDays] = useState<7 | 30>(7);
  const [errorType, setErrorType] = useState("");
  const [dimension, setDimension] = useState("");
  const [data, setData] = useState<WrongVocabularyResponse | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  const query = useMemo(() => {
    const params = new URLSearchParams({ days: String(days) });
    if (errorType) params.set("errorType", errorType);
    if (dimension) params.set("dimension", dimension);
    return params.toString();
  }, [days, dimension, errorType]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/vocabulary/wrong?${query}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok || !body.ok) throw new Error(body.message);
        setData(body);
        setState("ready");
      })
      .catch((error) => {
        if ((error as Error).name !== "AbortError") setState("error");
      });
    return () => controller.abort();
  }, [query]);

  const practiceHref = `/vocabulary/wrong/practice?${query}`;

  return (
    <main className="min-h-screen bg-[#f7f3e9] text-[#17241d]">
      <div className="mx-auto max-w-4xl px-6 py-8 sm:px-10">
        <header className="flex items-center justify-between border-b border-[#17241d]/15 pb-5">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#d94f3d]">
              Vocabulary mistakes
            </p>
            <h1 className="mt-1 text-3xl font-black">错词本</h1>
          </div>
          <Link href="/vocabulary" className="rounded-full border px-4 py-2 text-sm">
            返回
          </Link>
        </header>

        <section className="mt-6 grid gap-3 sm:grid-cols-3">
          <select
            value={days}
            onChange={(event) => {
              setState("loading");
              setDays(Number(event.target.value) as 7 | 30);
            }}
            className="rounded-xl border border-[#17241d]/15 bg-white px-4 py-3"
          >
            <option value={7}>最近 7 天</option>
            <option value={30}>最近 30 天</option>
          </select>
          <select
            value={errorType}
            onChange={(event) => {
              setState("loading");
              setErrorType(event.target.value);
            }}
            className="rounded-xl border border-[#17241d]/15 bg-white px-4 py-3"
          >
            {ERROR_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <select
            value={dimension}
            onChange={(event) => {
              setState("loading");
              setDimension(event.target.value);
            }}
            className="rounded-xl border border-[#17241d]/15 bg-white px-4 py-3"
          >
            {DIMENSION_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </section>

        {state === "loading" && (
          <p className="py-16 text-center text-[#17241d]/50">正在加载错词…</p>
        )}
        {state === "error" && (
          <p className="mt-8 rounded-xl bg-red-50 p-6 text-center text-red-700">
            错词本加载失败，请刷新重试。
          </p>
        )}
        {state === "ready" && data && (
          <>
            <div className="mt-6 flex items-center justify-between">
              <p className="text-sm text-[#17241d]/55">共 {data.total} 个错词</p>
              {data.total > 0 && (
                <Link
                  href={practiceHref}
                  className="rounded-xl bg-[#d94f3d] px-5 py-3 text-sm font-bold text-white"
                >
                  开始专项复习
                </Link>
              )}
            </div>
            {data.items.length === 0 ? (
              <div className="mt-8 rounded-2xl border border-[#17241d]/10 bg-white/70 p-10 text-center">
                当前筛选条件下没有错词。
              </div>
            ) : (
              <div className="mt-5 grid gap-3">
                {data.items.map((item) => (
                  <Link
                    key={item.vocabulary.id}
                    href={`/vocabulary/${item.vocabulary.id}`}
                    className="flex items-center justify-between rounded-2xl border border-[#17241d]/10 bg-white/80 p-5"
                  >
                    <div>
                      <p className="text-xl font-black">
                        {item.vocabulary.primaryWriting}
                        <span className="ml-3 text-sm font-normal text-[#17241d]/50">
                          {item.vocabulary.primaryReading}
                        </span>
                      </p>
                      <p className="mt-1 text-sm text-[#17241d]/60">
                        {item.vocabulary.primaryMeaningZh}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-red-600">错误 {item.errorCount} 次</p>
                      <p className="mt-1 text-xs text-[#17241d]/40">
                        {new Date(item.lastWrongAt).toLocaleDateString("zh-CN")}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

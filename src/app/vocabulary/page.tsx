"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { DashboardDTO } from "@/lib/vocabulary/types";

type LoadState = "loading" | "ready" | "unauthorized" | "error";

export default function VocabularyPage() {
  const [data, setData] = useState<DashboardDTO | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/vocabulary/dashboard", { signal: controller.signal })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (res.status === 401) { setLoadState("unauthorized"); return; }
        if (!res.ok || !body?.ok) { setLoadState("error"); return; }
        setData(body.dashboard);
        setLoadState("ready");
      })
      .catch((e) => {
        if ((e as Error).name !== "AbortError") setLoadState("error");
      });
    return () => controller.abort();
  }, []);

  return (
    <main className="min-h-screen bg-[#f7f3e9] text-[#17241d]">
      <div className="mx-auto max-w-3xl px-6 py-8 sm:px-10">
        <header className="mb-8 flex items-center justify-between border-b border-[#17241d]/15 pb-5">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#d94f3d]">N5 词汇</p>
            <h1 className="mt-1 text-3xl font-black tracking-tight">单词学习</h1>
          </div>
          <Link
            href="/"
            className="rounded-full border border-[#17241d]/15 bg-white/60 px-4 py-2 text-sm font-medium"
          >
            首页
          </Link>
        </header>

        {loadState === "loading" && (
          <div className="flex justify-center py-20">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#17241d]/20 border-t-[#d94f3d]" />
          </div>
        )}

        {loadState === "unauthorized" && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
            <p className="font-semibold text-amber-800">请先登录后使用单词功能。</p>
          </div>
        )}

        {loadState === "error" && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
            <p className="font-semibold text-red-700">加载失败，请刷新重试。</p>
          </div>
        )}

        {loadState === "ready" && data && (
          <div className="space-y-6">
            {/* Today's tasks */}
            <div className="grid gap-4 sm:grid-cols-2">
              <TaskCard
                title="今日新词"
                total={data.newToday.total}
                remaining={data.newToday.remaining}
                href="/vocabulary/learn"
                color="red"
              />
              <TaskCard
                title="今日复习"
                total={data.reviewToday.total}
                remaining={data.reviewToday.remaining}
                href="/vocabulary/review"
                color="blue"
              />
            </div>

            {/* Stats */}
            <div className="rounded-2xl border border-[#17241d]/15 bg-white/80 p-6">
              <h2 className="text-sm font-bold uppercase tracking-widest text-[#17241d]/40">
                总体进度
              </h2>
              <div className="mt-4 grid grid-cols-3 gap-4">
                <Stat label="总词数" value={data.totals.words} />
                <Stat label="已学习" value={data.totals.started} />
                <Stat label="已掌握" value={data.totals.mastered} />
              </div>
            </div>

            {/* Scores */}
            {data.totals.started > 0 && (
              <div className="rounded-2xl border border-[#17241d]/15 bg-white/80 p-6">
                <h2 className="text-sm font-bold uppercase tracking-widest text-[#17241d]/40">
                  能力维度平均分
                </h2>
                <div className="mt-4 space-y-3">
                  <ScoreBar label="读音" score={data.averages.reading} />
                  <ScoreBar label="词义" score={data.averages.meaning} />
                  <ScoreBar label="拼写" score={data.averages.spelling} />
                </div>
              </div>
            )}

            {/* Quick links */}
            <div className="grid gap-3 sm:grid-cols-2">
              <Link
                href="/vocabulary/book"
                className="rounded-2xl border border-[#17241d]/15 bg-white/80 p-5 transition hover:border-[#17241d]/30"
              >
                <p className="font-bold">单词本</p>
                <p className="mt-1 text-sm text-[#17241d]/50">浏览和搜索所有 N5 词汇</p>
              </Link>
              <Link
                href="/vocabulary/wrong"
                className="rounded-2xl border border-[#17241d]/15 bg-white/80 p-5 transition hover:border-[#17241d]/30"
              >
                <p className="font-bold">错词本</p>
                <p className="mt-1 text-sm text-[#17241d]/50">按错误类型开始专项复习</p>
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function TaskCard({
  title,
  total,
  remaining,
  href,
  color,
  disabled = false,
  disabledLabel,
}: {
  title: string;
  total: number;
  remaining: number;
  href: string;
  color: "red" | "blue";
  disabled?: boolean;
  disabledLabel?: string;
}) {
  const done = remaining === 0;
  const colorClass = color === "red" ? "text-[#d94f3d]" : "text-blue-600";
  const bgClass = color === "red" ? "bg-[#d94f3d]" : "bg-blue-600";

  if (disabled) {
    return (
      <div className="rounded-2xl border border-[#17241d]/10 bg-white/40 p-6 opacity-60">
        <p className={`text-xs font-bold uppercase tracking-widest ${colorClass}`}>{title}</p>
        <p className="mt-2 text-3xl font-black">{total}</p>
        <p className="mt-1 text-sm text-[#17241d]/40">{disabledLabel}</p>
      </div>
    );
  }

  return (
    <Link
      href={href}
      className="group rounded-2xl border border-[#17241d]/15 bg-white/80 p-6 transition hover:border-[#17241d]/30"
    >
      <p className={`text-xs font-bold uppercase tracking-widest ${colorClass}`}>{title}</p>
      <div className="mt-2 flex items-end justify-between">
        <div>
          <p className="text-3xl font-black">{remaining}</p>
          <p className="text-sm text-[#17241d]/50">剩余 / 共 {total}</p>
        </div>
        {done ? (
          <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700">
            已完成
          </span>
        ) : (
          <span
            className={`rounded-full ${bgClass} px-4 py-2 text-sm font-bold text-white transition group-hover:opacity-80`}
          >
            开始
          </span>
        )}
      </div>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <p className="text-2xl font-black">{value}</p>
      <p className="mt-1 text-xs text-[#17241d]/50">{label}</p>
    </div>
  );
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-10 text-sm text-[#17241d]/60">{label}</span>
      <div className="flex-1 overflow-hidden rounded-full bg-[#17241d]/10">
        <div
          className="h-2 rounded-full bg-[#d94f3d] transition-all"
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="w-8 text-right text-sm font-bold">{score}</span>
    </div>
  );
}

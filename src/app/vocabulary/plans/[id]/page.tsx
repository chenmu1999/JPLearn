"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import type { PlanDTO } from "@/lib/vocabulary/types";

type LoadState = "loading" | "ready" | "notfound" | "unauthorized" | "error";

export default function PlanDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const planId = params.id;
  const [plan, setPlan] = useState<PlanDTO | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");

  const load = useCallback(async () => {
    const res = await fetch(`/api/vocabulary/plans/${planId}`);
    if (res.status === 401) return setLoadState("unauthorized");
    if (res.status === 404) return setLoadState("notfound");
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.ok) return setLoadState("error");
    setPlan(body.plan as PlanDTO);
    setLoadState("ready");
  }, [planId]);

  useEffect(() => {
    load().catch(() => setLoadState("error"));
  }, [load]);

  async function archive() {
    if (!confirm("确定删除该计划吗？该计划的每日任务也会一并移除。")) return;
    const res = await fetch(`/api/vocabulary/plans/${planId}`, { method: "DELETE" });
    if (res.ok) router.push("/vocabulary/plans");
  }

  return (
    <main className="min-h-screen bg-[#f7f3e9] text-[#17241d]">
      <div className="mx-auto max-w-2xl px-6 py-8 sm:px-10">
        <header className="mb-7 flex items-center justify-between border-b border-[#17241d]/15 pb-5">
          <Link href="/vocabulary/plans" className="text-sm font-medium text-[#17241d]/60">
            ‹ 我的计划
          </Link>
          {loadState === "ready" && plan && (
            <button onClick={archive} className="text-sm font-medium text-[#d94f3d]/80 hover:text-[#d94f3d]">
              删除
            </button>
          )}
        </header>

        {loadState === "loading" && (
          <div className="flex justify-center py-20">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#17241d]/20 border-t-[#d94f3d]" />
          </div>
        )}
        {loadState === "unauthorized" && <Notice text="请先登录。" />}
        {loadState === "notfound" && <Notice text="未找到该计划。" />}
        {loadState === "error" && <Notice text="加载失败，请刷新重试。" tone="error" />}

        {loadState === "ready" && plan && (
          <PlanDetail plan={plan} onStart={() => router.push(`/vocabulary/learn?planId=${plan.id}`)} />
        )}
      </div>
    </main>
  );
}

function PlanDetail({ plan, onStart }: { plan: PlanDTO; onStart: () => void }) {
  const masteredPct = plan.totalWords > 0 ? Math.round((plan.masteredWords / plan.totalWords) * 100) : 0;
  const learnedPct = plan.totalWords > 0 ? Math.round((plan.learnedWords / plan.totalWords) * 100) : 0;
  const todayDone = plan.newToday.total - plan.newToday.remaining;
  const todayGoal = Math.max(plan.newToday.total, plan.todayTarget);
  const todayPct = todayGoal > 0 ? Math.round((todayDone / todayGoal) * 100) : 0;
  const finished = plan.endDate ? plan.daysLeft <= 0 : false;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <span className="inline-block rounded-md bg-[#24705a]/10 px-2 py-0.5 text-xs font-bold text-[#24705a]">
          {plan.level} 词表
        </span>
        <h1 className="mt-2 text-2xl font-black tracking-tight">{plan.name ?? `${plan.level} 计划`}</h1>
      </div>

      {/* Big progress ring */}
      <div className="flex flex-col items-center rounded-3xl border border-[#17241d]/15 bg-white/80 p-7">
        <BigRing percent={masteredPct} learnedPercent={learnedPct} />
        <p className="mt-4 text-sm text-[#17241d]/60">
          已掌握 <b className="text-[#17241d]">{plan.masteredWords}</b> · 已学{" "}
          <b className="text-[#17241d]">{plan.learnedWords}</b> / 共 {plan.totalWords} 词
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Stat label="今日目标" value={`${plan.todayTarget}`} unit="词" />
        <Stat label={finished ? "已到期" : "剩余天数"} value={plan.endDate ? `${plan.daysLeft}` : "—"} unit={plan.endDate ? "天" : ""} />
        <Stat label="每日均量" value={`${plan.dailyNewCount}`} unit="词" />
      </div>

      {/* Today's task */}
      <div className="rounded-3xl border border-[#17241d]/15 bg-white/80 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-widest text-[#17241d]/40">今日新词</h2>
          <span className="text-sm font-bold text-[#24705a]">
            {todayDone} / {todayGoal}
          </span>
        </div>
        <div className="mt-3 h-3 overflow-hidden rounded-full bg-[#17241d]/10">
          <div className="h-full rounded-full bg-[#24705a] transition-all" style={{ width: `${todayPct}%` }} />
        </div>
        <button
          onClick={onStart}
          className="mt-5 w-full rounded-2xl bg-[#24705a] py-4 text-base font-black text-white transition active:scale-[0.98] hover:bg-[#1c5a48]"
        >
          {plan.newToday.remaining > 0 || plan.newToday.total === 0 ? "开始今日学习" : "今日已完成 · 再背一组"}
        </button>
        <Link
          href={`/vocabulary/review?planId=${plan.id}`}
          className="mt-3 block rounded-2xl border border-[#17241d]/15 bg-white py-3 text-center text-sm font-bold text-[#17241d]/80"
        >
          复习 {plan.reviewToday.remaining > 0 ? `（${plan.reviewToday.remaining}）` : ""}
        </Link>
      </div>

      <p className="text-center text-xs text-[#17241d]/40">
        {plan.startDate} 起{plan.endDate ? ` · 目标 ${plan.endDate}` : ""}
      </p>
    </div>
  );
}

function BigRing({ percent, learnedPercent }: { percent: number; learnedPercent: number }) {
  const size = 168;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const center = size / 2;
  const masteredOffset = c - (Math.max(0, Math.min(100, percent)) / 100) * c;
  const learnedOffset = c - (Math.max(0, Math.min(100, learnedPercent)) / 100) * c;
  return (
    <svg width={size} height={size}>
      <circle cx={center} cy={center} r={r} fill="none" stroke="#17241d12" strokeWidth={stroke} />
      {/* learned (lighter) */}
      <circle
        cx={center}
        cy={center}
        r={r}
        fill="none"
        stroke="#24705a40"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={learnedOffset}
        transform={`rotate(-90 ${center} ${center})`}
      />
      {/* mastered (solid) */}
      <circle
        cx={center}
        cy={center}
        r={r}
        fill="none"
        stroke="#24705a"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={masteredOffset}
        transform={`rotate(-90 ${center} ${center})`}
      />
      <text x={center} y={center - 6} textAnchor="middle" style={{ fontSize: 40, fontWeight: 800, fill: "#17241d" }}>
        {percent}%
      </text>
      <text x={center} y={center + 22} textAnchor="middle" style={{ fontSize: 13, fill: "#17241d80" }}>
        已掌握
      </text>
    </svg>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="rounded-2xl border border-[#17241d]/12 bg-white/70 p-4 text-center">
      <p className="text-2xl font-black">
        {value}
        <span className="ml-0.5 text-sm font-bold text-[#17241d]/50">{unit}</span>
      </p>
      <p className="mt-1 text-xs text-[#17241d]/50">{label}</p>
    </div>
  );
}

function Notice({ text, tone = "default" }: { text: string; tone?: "default" | "error" }) {
  const cls =
    tone === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-amber-200 bg-amber-50 text-amber-800";
  return (
    <div className={`rounded-2xl border p-6 text-center font-semibold ${cls}`}>
      <p>{text}</p>
    </div>
  );
}

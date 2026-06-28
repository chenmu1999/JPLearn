"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { VOCABULARY_LEVELS } from "@/lib/vocabulary/config";
import type { PlanDTO, PlanTimeMode } from "@/lib/vocabulary/types";

// Known level sizes, for the create-form live preview only (server is authoritative).
const LEVEL_TOTALS: Record<string, number> = {
  N5: 718,
  N4: 668,
  N3: 2140,
  N2: 1906,
  N1: 2699,
};

type LoadState = "loading" | "ready" | "unauthorized" | "error";

export default function PlansPage() {
  const [plans, setPlans] = useState<PlanDTO[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [showForm, setShowForm] = useState(false);

  async function reload() {
    const res = await fetch("/api/vocabulary/plans");
    if (res.status === 401) {
      setLoadState("unauthorized");
      return;
    }
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.ok) {
      setLoadState("error");
      return;
    }
    setPlans(body.plans as PlanDTO[]);
    setLoadState("ready");
  }

  useEffect(() => {
    void (async () => {
      try {
        await reload();
      } catch {
        setLoadState("error");
      }
    })();
  }, []);

  return (
    <main className="min-h-screen bg-[#f7f3e9] text-[#17241d]">
      <div className="mx-auto max-w-2xl px-6 py-8 sm:px-10">
        <header className="mb-7 flex items-center justify-between border-b border-[#17241d]/15 pb-5">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#d94f3d]">背单词</p>
            <h1 className="mt-1 text-3xl font-black tracking-tight">我的计划</h1>
          </div>
          <Link
            href="/study"
            className="rounded-full border border-[#17241d]/15 bg-white/60 px-4 py-2 text-sm font-medium"
          >
            返回
          </Link>
        </header>

        {loadState === "loading" && (
          <div className="flex justify-center py-20">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#17241d]/20 border-t-[#d94f3d]" />
          </div>
        )}

        {loadState === "unauthorized" && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
            <p className="font-semibold text-amber-800">请先登录后制定背单词计划。</p>
            <Link href="/login" className="mt-3 inline-block rounded-full bg-[#17241d] px-5 py-2 text-sm font-bold text-white">
              去登录
            </Link>
          </div>
        )}

        {loadState === "error" && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
            <p className="font-semibold text-red-700">加载失败，请刷新重试。</p>
          </div>
        )}

        {loadState === "ready" && (
          <div className="space-y-5">
            {showForm ? (
              <CreatePlanForm
                existingLevels={plans.filter((p) => p.status === "ACTIVE").map((p) => p.level)}
                onCancel={() => setShowForm(false)}
                onCreated={async () => {
                  setShowForm(false);
                  await reload();
                }}
              />
            ) : (
              <button
                onClick={() => setShowForm(true)}
                className="w-full rounded-2xl border-2 border-dashed border-[#24705a]/40 bg-white/50 py-5 text-base font-bold text-[#24705a] transition hover:border-[#24705a] hover:bg-[#24705a]/5"
              >
                ＋ 新建背单词计划
              </button>
            )}

            {plans.length === 0 && !showForm && (
              <p className="py-10 text-center text-sm text-[#17241d]/50">
                还没有计划。点击上方按钮，选择一个词表和时间，开始背词。
              </p>
            )}

            {plans.map((plan) => (
              <PlanCard key={plan.id} plan={plan} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function PlanCard({ plan }: { plan: PlanDTO }) {
  const pct = plan.totalWords > 0 ? Math.round((plan.masteredWords / plan.totalWords) * 100) : 0;
  return (
    <Link
      href={`/vocabulary/plans/${plan.id}`}
      className="flex items-center gap-5 rounded-2xl border border-[#17241d]/15 bg-white/80 p-5 transition hover:border-[#24705a]"
    >
      <ProgressRing percent={pct} size={64} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-[#24705a]/10 px-2 py-0.5 text-xs font-bold text-[#24705a]">
            {plan.level}
          </span>
          <p className="truncate text-lg font-black">{plan.name ?? `${plan.level} 计划`}</p>
        </div>
        <p className="mt-1 text-sm text-[#17241d]/60">
          已掌握 {plan.masteredWords} / {plan.totalWords} · 每天约 {plan.dailyNewCount} 词
        </p>
        <p className="mt-0.5 text-xs text-[#17241d]/45">
          {plan.endDate
            ? plan.daysLeft > 0
              ? `剩 ${plan.daysLeft} 天 · 今日 ${plan.todayTarget} 词`
              : "已到期"
            : `今日 ${plan.todayTarget} 词`}
        </p>
      </div>
      <span className="text-xl text-[#17241d]/30">›</span>
    </Link>
  );
}

function CreatePlanForm({
  existingLevels,
  onCancel,
  onCreated,
}: {
  existingLevels: string[];
  onCancel: () => void;
  onCreated: () => void;
}) {
  const firstAvailable = VOCABULARY_LEVELS.find((l) => !existingLevels.includes(l)) ?? VOCABULARY_LEVELS[0];
  const [level, setLevel] = useState<string>(firstAvailable);
  const [mode, setMode] = useState<PlanTimeMode>("BY_DAILY");
  const [dailyCount, setDailyCount] = useState(20);
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 60);
    return d.toISOString().slice(0, 10);
  });
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const total = LEVEL_TOTALS[level] ?? 0;
  const alreadyActive = existingLevels.includes(level);

  // Live preview
  let previewDaily = dailyCount;
  let previewDays = 0;
  if (mode === "BY_DAILY") {
    previewDaily = Math.max(1, dailyCount);
    previewDays = Math.ceil(total / previewDaily);
  } else {
    const days = Math.max(
      1,
      Math.round((Date.parse(endDate) - Date.parse(new Date().toISOString().slice(0, 10))) / 86400000) + 1,
    );
    previewDays = days;
    previewDaily = Math.ceil(total / days);
  }

  async function submit() {
    if (submitting || alreadyActive) return;
    setSubmitting(true);
    setError("");
    try {
      const payload: Record<string, unknown> = { level, mode, name: name.trim() || undefined };
      if (mode === "BY_DAILY") payload.dailyCount = Math.max(1, dailyCount);
      else payload.endDate = endDate;
      const res = await fetch("/api/vocabulary/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) {
        setError(body?.message ?? "创建失败，请重试。");
        return;
      }
      onCreated();
    } catch {
      setError("网络错误，请重试。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[#24705a]/30 bg-white/85 p-5 shadow-[0_14px_40px_rgba(36,112,90,0.12)]">
      <h2 className="text-lg font-black">新建计划</h2>

      <label className="mt-4 block text-sm font-bold">词表（JLPT 等级）</label>
      <div className="mt-2 grid grid-cols-5 gap-2">
        {VOCABULARY_LEVELS.map((l) => (
          <button
            key={l}
            onClick={() => setLevel(l)}
            className={`rounded-xl border py-2 text-sm font-bold transition ${
              level === l
                ? "border-[#24705a] bg-[#24705a] text-white"
                : "border-[#17241d]/15 bg-white text-[#17241d]"
            }`}
          >
            {l}
          </button>
        ))}
      </div>
      {alreadyActive && (
        <p className="mt-2 text-xs font-medium text-[#d94f3d]">该等级已有进行中的计划，请选择其他等级。</p>
      )}

      <label className="mt-4 block text-sm font-bold">计划方式</label>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          onClick={() => setMode("BY_DAILY")}
          className={`rounded-xl border py-2 text-sm font-bold transition ${
            mode === "BY_DAILY" ? "border-[#24705a] bg-[#24705a]/10 text-[#24705a]" : "border-[#17241d]/15 bg-white"
          }`}
        >
          定每日词数
        </button>
        <button
          onClick={() => setMode("BY_END_DATE")}
          className={`rounded-xl border py-2 text-sm font-bold transition ${
            mode === "BY_END_DATE" ? "border-[#24705a] bg-[#24705a]/10 text-[#24705a]" : "border-[#17241d]/15 bg-white"
          }`}
        >
          定结束日期
        </button>
      </div>

      {mode === "BY_DAILY" ? (
        <div className="mt-3">
          <label className="block text-sm font-bold">每天背多少词</label>
          <input
            type="number"
            min={1}
            max={500}
            value={dailyCount}
            onChange={(e) => setDailyCount(Number(e.target.value))}
            className="mt-2 w-full rounded-xl border border-[#17241d]/15 bg-white px-4 py-2.5 text-base outline-none focus:border-[#24705a]"
          />
        </div>
      ) : (
        <div className="mt-3">
          <label className="block text-sm font-bold">计划完成日期</label>
          <input
            type="date"
            value={endDate}
            min={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setEndDate(e.target.value)}
            className="mt-2 w-full rounded-xl border border-[#17241d]/15 bg-white px-4 py-2.5 text-base outline-none focus:border-[#24705a]"
          />
        </div>
      )}

      <div className="mt-3">
        <label className="block text-sm font-bold">计划名称（可选）</label>
        <input
          type="text"
          maxLength={40}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={`${level} 计划`}
          className="mt-2 w-full rounded-xl border border-[#17241d]/15 bg-white px-4 py-2.5 text-base outline-none focus:border-[#24705a]"
        />
      </div>

      <div className="mt-4 rounded-xl bg-[#f7f3e9] px-4 py-3 text-sm text-[#17241d]/75">
        共 <b>{total}</b> 词 · 每天约 <b>{previewDaily}</b> 词 · 预计 <b>{previewDays}</b> 天完成
      </div>

      {error && <p className="mt-3 text-sm font-medium text-[#d94f3d]">{error}</p>}

      <div className="mt-4 flex gap-3">
        <button
          onClick={onCancel}
          className="flex-1 rounded-full border border-[#17241d]/15 bg-white py-2.5 text-sm font-bold"
        >
          取消
        </button>
        <button
          onClick={submit}
          disabled={submitting || alreadyActive}
          className="flex-1 rounded-full bg-[#24705a] py-2.5 text-sm font-bold text-white transition hover:bg-[#1c5a48] disabled:opacity-40"
        >
          {submitting ? "创建中…" : "创建计划"}
        </button>
      </div>
    </div>
  );
}

function ProgressRing({ percent, size }: { percent: number; size: number }) {
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.max(0, Math.min(100, percent)) / 100) * c;
  const center = size / 2;
  return (
    <svg width={size} height={size} className="shrink-0">
      {/* track */}
      <circle cx={center} cy={center} r={r} fill="none" stroke="#17241d18" strokeWidth={stroke} />
      {/* progress arc, rotated to start at 12 o'clock */}
      <circle
        cx={center}
        cy={center}
        r={r}
        fill="none"
        stroke="#24705a"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${center} ${center})`}
      />
      <text
        x={center}
        y={center}
        dominantBaseline="central"
        textAnchor="middle"
        style={{ fontSize: size * 0.24, fontWeight: 800, fill: "#17241d" }}
      >
        {percent}%
      </text>
    </svg>
  );
}

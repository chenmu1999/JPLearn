"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import type {
  AttemptResultDTO,
  LearnNextDTO,
  QuestionDTO,
  QuestionOption,
  VocabularyDetail,
} from "@/lib/vocabulary/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PagePhase =
  | "LOADING"
  | "CARD"     // showing word card (before quiz)
  | "QUESTION" // user is answering
  | "SUBMITTING"
  | "RESULT"
  | "DONE"
  | "ERROR";

interface StudyState {
  phase: PagePhase;
  sessionId: string | null;
  card: VocabularyDetail | null;
  question: QuestionDTO | null;
  sessionItemId: string | null;
  assignmentId: string | null;
  remaining: number;
  result: AttemptResultDTO | null;
  errorMsg: string;
  answer: string;
  selectedOptionId: string | null;
}

const INITIAL: StudyState = {
  phase: "LOADING",
  sessionId: null,
  card: null,
  question: null,
  sessionItemId: null,
  assignmentId: null,
  remaining: 0,
  result: null,
  errorMsg: "",
  answer: "",
  selectedOptionId: null,
};

const ERROR_TYPE_LABELS: Record<string, string> = {
  SCRIPT_CONFUSION: "假名字母混淆（平片假名）",
  DAKUON_HANDAKUON: "浊音/半浊音错误",
  SMALL_KANA: "小假名错误（っ/ゃ 等）",
  SOKUON: "促音错误（っ）",
  LONG_VOWEL: "长音错误（ー）",
  MORAIC_N: "拨音错误（ん）",
  KANA_SPELLING: "假名拼写错误",
  MEANING_CONFUSION: "含义混淆",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function LearnPage() {
  const [state, setState] = useState<StudyState>(INITIAL);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const planIdRef = useRef<string | null>(null);
  const [backHref, setBackHref] = useState("/vocabulary");

  const loadNext = useCallback(async (sessionId: string, alive: boolean, signal: AbortSignal) => {
    setState((s) => ({ ...s, phase: "LOADING", sessionId }));
    try {
      const planQuery = planIdRef.current ? `?planId=${encodeURIComponent(planIdRef.current)}` : "";
      const res = await fetch(`/api/vocabulary/learn/next${planQuery}`, { signal });
      if (!alive) return;
      const body: { ok: boolean; message?: string } & Partial<LearnNextDTO> = await res.json();
      if (!alive) return;

      if (res.status === 401) {
        setState((s) => ({ ...s, phase: "ERROR", errorMsg: "请先登录。" }));
        return;
      }
      if (!res.ok || !body.ok) {
        setState((s) => ({ ...s, phase: "ERROR", errorMsg: body.message ?? "加载失败。" }));
        return;
      }

      if (body.done) {
        setState((s) => ({ ...s, phase: "DONE", remaining: body.remaining ?? 0, sessionId }));
        return;
      }

      setState((s) => ({
        ...s,
        phase: "CARD",
        sessionId,
        card: body.card ?? null,
        question: body.question ?? null,
        sessionItemId: body.sessionItemId ?? null,
        assignmentId: body.assignmentId ?? null,
        remaining: body.remaining ?? 0,
        result: null,
        answer: "",
        selectedOptionId: null,
      }));
    } catch (e) {
      if (!alive) return;
      if ((e as Error).name === "AbortError") return;
      setState((s) => ({ ...s, phase: "ERROR", errorMsg: "网络错误，请刷新重试。" }));
    }
  }, []);

  // Session initialisation + first card
  useEffect(() => {
    let alive = true;
    const ac = new AbortController();
    abortRef.current = ac;

    planIdRef.current = new URLSearchParams(window.location.search).get("planId");
    if (planIdRef.current) setBackHref(`/vocabulary/plans/${planIdRef.current}`);

    (async () => {
      try {
        // Create / resume LEARN session (scoped to the plan, if any)
        const sessRes = await fetch("/api/vocabulary/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionType: "LEARN", planId: planIdRef.current ?? undefined }),
          signal: ac.signal,
        });
        if (!alive) return;
        if (sessRes.status === 401) {
          setState((s) => ({ ...s, phase: "ERROR", errorMsg: "请先登录。" }));
          return;
        }
        const sessBody = await sessRes.json();
        if (!sessRes.ok || !sessBody.ok) {
          setState((s) => ({ ...s, phase: "ERROR", errorMsg: sessBody.message ?? "会话创建失败。" }));
          return;
        }
        const sessionId: string = sessBody.session.sessionId || "";

        await loadNext(sessionId, alive, ac.signal);
      } catch (e) {
        if (!alive) return;
        if ((e as Error).name === "AbortError") return;
        setState((s) => ({ ...s, phase: "ERROR", errorMsg: "网络错误，请刷新重试。" }));
      }
    })();

    return () => {
      alive = false;
      ac.abort();
    };
  }, [loadNext]);

  // Auto-focus input when entering QUESTION phase
  useEffect(() => {
    if (state.phase === "QUESTION" && inputRef.current) {
      inputRef.current.focus();
    }
  }, [state.phase]);

  const handleStartQuiz = useCallback(() => {
    setState((s) => ({ ...s, phase: "QUESTION" }));
  }, []);

  const handleSubmit = useCallback(async () => {
    const { question, answer, selectedOptionId, sessionId } = state;
    if (!question) return;

    const isChoice = question.options !== null;
    const finalAnswer = isChoice ? (selectedOptionId ?? "") : answer.trim();
    if (!finalAnswer) return;

    setState((s) => ({ ...s, phase: "SUBMITTING" }));

    try {
      const res = await fetch("/api/vocabulary/attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: question.questionId,
          answer: finalAnswer,
          usedHint: false,
          responseTimeMs: null,
        }),
      });
      const body: { ok: boolean; message?: string; result?: AttemptResultDTO } = await res.json();

      if (!res.ok || !body.ok || !body.result) {
        setState((s) => ({
          ...s,
          phase: "ERROR",
          errorMsg: body.message ?? "提交失败，请重试。",
        }));
        return;
      }

      setState((s) => ({
        ...s,
        phase: "RESULT",
        result: body.result!,
        remaining: body.result!.remainingCount,
        sessionId: sessionId,
      }));
    } catch {
      setState((s) => ({ ...s, phase: "ERROR", errorMsg: "网络错误，请重试。" }));
    }
  }, [state]);

  const handleNext = useCallback(async () => {
    const { sessionId } = state;
    if (!sessionId) return;
    const ac = new AbortController();
    abortRef.current = ac;
    await loadNext(sessionId, true, ac.signal);
  }, [state, loadNext]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && !e.nativeEvent.isComposing && state.phase === "QUESTION") {
        void handleSubmit();
      }
    },
    [handleSubmit, state.phase],
  );

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const { phase, card, question, result, remaining, errorMsg, answer, selectedOptionId } = state;

  return (
    <main className="min-h-screen bg-[#f7f3e9] text-[#17241d]">
      <div className="mx-auto max-w-2xl px-6 py-8 sm:px-10">
        <header className="mb-8 flex items-center justify-between border-b border-[#17241d]/15 pb-5">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#d94f3d]">N5 词汇</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight">今日新词</h1>
          </div>
          <Link
            href={backHref}
            className="rounded-full border border-[#17241d]/15 bg-white/60 px-4 py-2 text-sm font-medium"
          >
            返回
          </Link>
        </header>

        {phase === "LOADING" && <LoadingSpinner />}

        {phase === "ERROR" && <ErrorCard message={errorMsg} />}

        {phase === "DONE" && <DoneCard remaining={remaining} backHref={backHref} />}

        {(phase === "CARD" || phase === "QUESTION" || phase === "SUBMITTING") && card && question && (
          <StudyCard
            card={card}
            question={question}
            phase={phase}
            remaining={remaining}
            answer={answer}
            selectedOptionId={selectedOptionId}
            inputRef={inputRef}
            onAnswerChange={(v) => setState((s) => ({ ...s, answer: v }))}
            onOptionSelect={(id) => setState((s) => ({ ...s, selectedOptionId: id }))}
            onStartQuiz={handleStartQuiz}
            onSubmit={handleSubmit}
            onKeyDown={handleKeyDown}
          />
        )}

        {phase === "RESULT" && card && question && result && (
          <ResultCard
            card={card}
            question={question}
            result={result}
            remaining={remaining}
            onNext={handleNext}
          />
        )}
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#17241d]/20 border-t-[#d94f3d]" />
    </div>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center">
      <p className="text-lg font-semibold text-red-700">{message}</p>
      <button
        onClick={() => window.location.reload()}
        className="mt-4 rounded-xl bg-red-600 px-6 py-2 text-sm font-bold text-white"
      >
        刷新重试
      </button>
    </div>
  );
}

function DoneCard({ remaining, backHref }: { remaining: number; backHref: string }) {
  return (
    <div className="rounded-2xl border border-[#17241d]/15 bg-white/80 p-8 text-center">
      <div className="mb-4 text-5xl">🎉</div>
      <h2 className="text-2xl font-black">
        {remaining > 0 ? "当前已无可作答的题目" : "今日新词已完成！"}
      </h2>
      <p className="mt-2 text-[#17241d]/60">
        {remaining > 0
          ? `还有 ${remaining} 道错题将在稍后出现。`
          : "继续保持，明日再来学习新词。"}
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Link
          href={backHref}
          className="rounded-xl border border-[#17241d]/20 bg-white px-6 py-2 text-sm font-semibold"
        >
          返回
        </Link>
      </div>
    </div>
  );
}

interface StudyCardProps {
  card: VocabularyDetail;
  question: QuestionDTO;
  phase: PagePhase;
  remaining: number;
  answer: string;
  selectedOptionId: string | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onAnswerChange: (v: string) => void;
  onOptionSelect: (id: string) => void;
  onStartQuiz: () => void;
  onSubmit: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

function StudyCard({
  card,
  question,
  phase,
  remaining,
  answer,
  selectedOptionId,
  inputRef,
  onAnswerChange,
  onOptionSelect,
  onStartQuiz,
  onSubmit,
  onKeyDown,
}: StudyCardProps) {
  const isChoice = question.options !== null;
  const canSubmit =
    phase === "QUESTION" && (isChoice ? selectedOptionId !== null : answer.trim().length > 0);
  const isSubmitting = phase === "SUBMITTING";

  return (
    <div className="space-y-5">
      {/* Progress indicator */}
      <div className="text-right text-sm text-[#17241d]/50">剩余 {remaining} 题</div>

      {/* Word info card */}
      <div className="rounded-2xl border border-[#17241d]/15 bg-white/80 p-6">
        <div className="flex items-baseline gap-4">
          <span className="text-4xl font-black tracking-tight">{card.primaryWriting}</span>
          <span className="text-xl text-[#17241d]/60">{card.primaryReading}</span>
        </div>
        {card.primaryMeaningZh && (
          <p className="mt-3 text-base text-[#17241d]/80">{card.primaryMeaningZh}</p>
        )}
        {card.examples.length > 0 && (
          <div className="mt-4 rounded-xl bg-[#f7f3e9] px-4 py-3 text-sm">
            <p className="font-medium text-[#17241d]">{card.examples[0].japanese}</p>
            {card.examples[0].chinese && (
              <p className="mt-1 text-[#17241d]/60">{card.examples[0].chinese}</p>
            )}
          </div>
        )}
      </div>

      {/* Quiz section */}
      {phase === "CARD" ? (
        <button
          onClick={onStartQuiz}
          className="w-full rounded-2xl bg-[#17241d] py-4 text-base font-bold text-white transition hover:bg-[#17241d]/80"
        >
          开始测验
        </button>
      ) : (
        <div className="rounded-2xl border border-[#17241d]/15 bg-white/80 p-6 space-y-4">
          <QuestionPromptView question={question} />

          {isChoice ? (
            <ChoiceOptions
              options={question.options!}
              selectedId={selectedOptionId}
              disabled={isSubmitting}
              onSelect={onOptionSelect}
            />
          ) : (
            <input
              ref={inputRef}
              type="text"
              value={answer}
              onChange={(e) => onAnswerChange(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={isSubmitting}
              placeholder="请输入假名"
              className="w-full rounded-xl border border-[#17241d]/20 bg-white px-4 py-3 text-lg font-medium placeholder-[#17241d]/30 focus:outline-none focus:ring-2 focus:ring-[#d94f3d]/40"
            />
          )}

          <button
            onClick={onSubmit}
            disabled={!canSubmit || isSubmitting}
            className="w-full rounded-2xl bg-[#d94f3d] py-3 text-base font-bold text-white transition hover:bg-[#d94f3d]/80 disabled:opacity-40"
          >
            {isSubmitting ? "提交中…" : "提交"}
          </button>
        </div>
      )}
    </div>
  );
}

function QuestionPromptView({ question }: { question: QuestionDTO }) {
  const { exerciseType, prompt } = question;
  switch (exerciseType) {
    case "WRITING_TO_READING_INPUT":
      return (
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-[#17241d]/40">读音输入</p>
          <p className="mt-2 text-3xl font-black">{prompt.writing}</p>
          <p className="mt-1 text-sm text-[#17241d]/50">请输入假名读音</p>
        </div>
      );
    case "READING_TO_MEANING_CHOICE":
      return (
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-[#17241d]/40">选择含义</p>
          <p className="mt-2 text-3xl font-black">{prompt.reading}</p>
          <p className="mt-1 text-sm text-[#17241d]/50">选择正确的中文含义</p>
        </div>
      );
    case "MEANING_TO_WORD_CHOICE":
      return (
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-[#17241d]/40">选择单词</p>
          <p className="mt-2 text-2xl font-bold">{prompt.meaningZh}</p>
          <p className="mt-1 text-sm text-[#17241d]/50">选择对应的日语单词</p>
        </div>
      );
    case "CONTEXT_WORD_CHOICE":
      return (
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-[#17241d]/40">语境选词</p>
          <p className="mt-2 text-xl font-medium leading-relaxed">{prompt.context}</p>
          <p className="mt-1 text-sm text-[#17241d]/50">选择填入空白处的词</p>
        </div>
      );
    default:
      return <p className="text-sm text-[#17241d]/50">题型暂不支持</p>;
  }
}

function ChoiceOptions({
  options,
  selectedId,
  disabled,
  onSelect,
}: {
  options: QuestionOption[];
  selectedId: string | null;
  disabled: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {options.map((opt) => (
        <button
          key={opt.id}
          onClick={() => onSelect(opt.id)}
          disabled={disabled}
          className={[
            "rounded-xl border px-4 py-3 text-left text-sm font-medium transition",
            selectedId === opt.id
              ? "border-[#d94f3d] bg-[#d94f3d]/10 text-[#d94f3d]"
              : "border-[#17241d]/15 bg-white text-[#17241d] hover:border-[#17241d]/30",
            disabled ? "opacity-50" : "",
          ].join(" ")}
        >
          {opt.text}
        </button>
      ))}
    </div>
  );
}

interface ResultCardProps {
  card: VocabularyDetail;
  question: QuestionDTO;
  result: AttemptResultDTO;
  remaining: number;
  onNext: () => void;
}

function ResultCard({ card, question, result, remaining, onNext }: ResultCardProps) {
  const isCorrect = result.isCorrect;
  const isInputType = question.exerciseType === "WRITING_TO_READING_INPUT";

  return (
    <div className="space-y-5">
      <div className="text-right text-sm text-[#17241d]/50">剩余 {remaining} 题</div>

      {/* Result banner */}
      <div
        className={`rounded-2xl p-6 text-center ${isCorrect ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}
      >
        <div className="text-4xl mb-2">{isCorrect ? "✓" : "✗"}</div>
        <p className={`text-xl font-black ${isCorrect ? "text-green-700" : "text-red-700"}`}>
          {isCorrect ? "回答正确！" : "回答错误"}
        </p>
        {!isCorrect && (
          <div className="mt-3">
            <p className="text-sm text-[#17241d]/60">正确答案：</p>
            <p className="text-2xl font-bold text-red-700 mt-1">{result.acceptedAnswer}</p>
            {result.errorType && (
              <p className="mt-2 text-sm text-red-600">
                {ERROR_TYPE_LABELS[result.errorType] ?? result.errorType}
              </p>
            )}
          </div>
        )}
        {isInputType && (
          <p className="mt-3 text-xs text-[#17241d]/50">
            得分 {result.scoreBefore} → {result.scoreAfter}
          </p>
        )}
      </div>

      {/* Word summary */}
      <div className="rounded-2xl border border-[#17241d]/15 bg-white/80 p-5">
        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-black">{card.primaryWriting}</span>
          <span className="text-lg text-[#17241d]/60">{card.primaryReading}</span>
        </div>
        {card.primaryMeaningZh && (
          <p className="mt-2 text-sm text-[#17241d]/70">{card.primaryMeaningZh}</p>
        )}
      </div>

      <button
        onClick={onNext}
        className="w-full rounded-2xl bg-[#17241d] py-4 text-base font-bold text-white transition hover:bg-[#17241d]/80"
      >
        {result.sessionComplete ? "查看学习结果" : "继续"}
      </button>
    </div>
  );
}

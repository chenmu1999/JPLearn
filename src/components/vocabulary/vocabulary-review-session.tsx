"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  SESSION_TYPE,
  type AttemptResultDTO,
  type LearnNextDTO,
  type QuestionDTO,
  type VocabularyDetail,
} from "@/lib/vocabulary/types";

interface ReviewSessionProps {
  sessionType: typeof SESSION_TYPE.REVIEW | typeof SESSION_TYPE.WRONG_BOOK;
  title: string;
  backHref: string;
  planId?: string;
  filters?: { days?: 7 | 30; errorType?: string; dimension?: string };
}

type Phase = "LOADING" | "QUESTION" | "SUBMITTING" | "RESULT" | "DONE" | "ERROR";

export function VocabularyReviewSession({
  sessionType,
  title,
  backHref,
  planId,
  filters,
}: ReviewSessionProps) {
  const [phase, setPhase] = useState<Phase>("LOADING");
  const [card, setCard] = useState<VocabularyDetail | null>(null);
  const [question, setQuestion] = useState<QuestionDTO | null>(null);
  const [result, setResult] = useState<AttemptResultDTO | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [answer, setAnswer] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const loadNext = useCallback(async (signal?: AbortSignal) => {
    setPhase("LOADING");
    try {
      const response = await fetch(
        `/api/vocabulary/review/next?sessionType=${sessionType}${planId ? `&planId=${encodeURIComponent(planId)}` : ""}`,
        { signal },
      );
      const body: { ok: boolean; message?: string } & Partial<LearnNextDTO> =
        await response.json();
      if (!response.ok || !body.ok) {
        setMessage(body.message ?? "复习题目加载失败。");
        setPhase("ERROR");
        return;
      }
      if (body.done) {
        setRemaining(body.remaining ?? 0);
        setPhase("DONE");
        return;
      }
      setCard(body.card ?? null);
      setQuestion(body.question ?? null);
      setRemaining(body.remaining ?? 0);
      setResult(null);
      setAnswer("");
      setSelected(null);
      setPhase("QUESTION");
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
      setMessage("网络错误，请刷新重试。");
      setPhase("ERROR");
    }
  }, [sessionType, planId]);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch("/api/vocabulary/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionType, planId, ...filters }),
          signal: controller.signal,
        });
        const body = await response.json();
        if (!response.ok || !body.ok) {
          setMessage(body.message ?? "复习会话创建失败。");
          setPhase("ERROR");
          return;
        }
        await loadNext(controller.signal);
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        setMessage("网络错误，请刷新重试。");
        setPhase("ERROR");
      }
    })();
    return () => controller.abort();
  }, [filters, loadNext, sessionType, planId]);

  useEffect(() => {
    if (phase === "QUESTION") inputRef.current?.focus();
  }, [phase]);

  async function submit() {
    if (!question) return;
    const submittedAnswer = question.options ? selected : answer.trim();
    if (!submittedAnswer) return;
    setPhase("SUBMITTING");
    try {
      const response = await fetch("/api/vocabulary/attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: question.questionId,
          answer: submittedAnswer,
          usedHint: false,
          responseTimeMs: null,
        }),
      });
      const body: { ok: boolean; message?: string; result?: AttemptResultDTO } =
        await response.json();
      if (!response.ok || !body.ok || !body.result) {
        setMessage(body.message ?? "提交失败。");
        setPhase("ERROR");
        return;
      }
      setResult(body.result);
      setRemaining(body.result.remainingCount);
      setPhase("RESULT");
    } catch {
      setMessage("网络错误，请重试。");
      setPhase("ERROR");
    }
  }

  const canSubmit = question?.options ? selected !== null : answer.trim().length > 0;

  return (
    <main className="min-h-screen bg-[#f7f3e9] text-[#17241d]">
      <div className="mx-auto max-w-2xl px-6 py-8 sm:px-10">
        <header className="mb-8 flex items-center justify-between border-b border-[#17241d]/15 pb-5">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#24705a]">
              N5 词汇
            </p>
            <h1 className="mt-1 text-2xl font-black">{title}</h1>
          </div>
          <Link
            href={backHref}
            className="rounded-full border border-[#17241d]/15 bg-white/60 px-4 py-2 text-sm font-medium"
          >
            返回
          </Link>
        </header>

        {phase === "LOADING" && (
          <div className="py-20 text-center text-[#17241d]/55">正在准备复习…</div>
        )}
        {phase === "ERROR" && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center">
            <p className="font-semibold text-red-700">{message}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 rounded-xl bg-red-600 px-5 py-2 text-sm font-bold text-white"
            >
              刷新重试
            </button>
          </div>
        )}
        {phase === "DONE" && (
          <div className="rounded-2xl border border-[#17241d]/15 bg-white/80 p-8 text-center">
            <p className="text-4xl">✓</p>
            <h2 className="mt-3 text-2xl font-black">本轮复习完成</h2>
            <p className="mt-2 text-sm text-[#17241d]/55">
              {remaining > 0 ? `仍有 ${remaining} 道题等待处理。` : "复习记录已保存。"}
            </p>
          </div>
        )}

        {(phase === "QUESTION" || phase === "SUBMITTING") && card && question && (
          <div className="space-y-5">
            <p className="text-right text-sm text-[#17241d]/50">剩余 {remaining} 题</p>
            <div className="rounded-2xl border border-[#17241d]/15 bg-white/80 p-6">
              <QuestionHeading question={question} />
              {question.options ? (
                <div className="mt-5 grid grid-cols-2 gap-3">
                  {question.options.map((option) => (
                    <button
                      key={option.id}
                      disabled={phase === "SUBMITTING"}
                      onClick={() => setSelected(option.id)}
                      className={`rounded-xl border px-4 py-3 text-left text-sm font-medium ${
                        selected === option.id
                          ? "border-[#24705a] bg-[#24705a]/10"
                          : "border-[#17241d]/15 bg-white"
                      }`}
                    >
                      {option.text}
                    </button>
                  ))}
                </div>
              ) : (
                <input
                  ref={inputRef}
                  value={answer}
                  disabled={phase === "SUBMITTING"}
                  onChange={(event) => setAnswer(event.target.value)}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      !event.nativeEvent.isComposing &&
                      canSubmit
                    ) {
                      void submit();
                    }
                  }}
                  placeholder="请输入假名"
                  className="mt-5 w-full rounded-xl border border-[#17241d]/20 bg-white px-4 py-3 text-lg"
                />
              )}
              <button
                disabled={!canSubmit || phase === "SUBMITTING"}
                onClick={() => void submit()}
                className="mt-5 w-full rounded-xl bg-[#24705a] py-3 font-bold text-white disabled:opacity-40"
              >
                {phase === "SUBMITTING" ? "提交中…" : "提交"}
              </button>
            </div>
          </div>
        )}

        {phase === "RESULT" && card && result && (
          <div className="space-y-5">
            <div
              className={`rounded-2xl border p-7 text-center ${
                result.isCorrect
                  ? "border-green-200 bg-green-50"
                  : "border-red-200 bg-red-50"
              }`}
            >
              <h2 className="text-2xl font-black">
                {result.isCorrect ? "回答正确" : "回答错误"}
              </h2>
              {!result.isCorrect && (
                <p className="mt-3 text-lg font-bold text-red-700">
                  正确答案：{result.acceptedAnswer}
                </p>
              )}
              <p className="mt-3 text-sm text-[#17241d]/60">
                {card.primaryWriting} · {card.primaryReading} · {card.primaryMeaningZh}
              </p>
            </div>
            <button
              onClick={() => void loadNext()}
              className="w-full rounded-xl bg-[#17241d] py-3 font-bold text-white"
            >
              {result.sessionComplete ? "完成" : "继续"}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

function QuestionHeading({ question }: { question: QuestionDTO }) {
  const prompt =
    question.prompt.writing ??
    question.prompt.reading ??
    question.prompt.meaningZh ??
    question.prompt.context ??
    "";
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-widest text-[#17241d]/40">
        {question.exerciseType === "WRITING_TO_READING_INPUT"
          ? "输入假名读音"
          : "选择正确答案"}
      </p>
      <p className="mt-2 text-2xl font-black leading-relaxed">{prompt}</p>
    </div>
  );
}

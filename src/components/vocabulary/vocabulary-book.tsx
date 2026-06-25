"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { VOCABULARY_STATUS, type VocabularyListItem } from "@/lib/vocabulary/types";

const STATUS_LABELS: Record<string, string> = {
  [VOCABULARY_STATUS.NEW]: "未学",
  [VOCABULARY_STATUS.LEARNING]: "学习中",
  [VOCABULARY_STATUS.REVIEWING]: "复习中",
  [VOCABULARY_STATUS.MASTERED]: "已掌握",
};

const STATUS_FILTERS = [
  { value: "", label: "全部" },
  { value: VOCABULARY_STATUS.NEW, label: "未学" },
  { value: VOCABULARY_STATUS.LEARNING, label: "学习中" },
  { value: VOCABULARY_STATUS.REVIEWING, label: "复习中" },
  { value: VOCABULARY_STATUS.MASTERED, label: "已掌握" },
];

const SORT_OPTIONS = [
  { value: "order", label: "按词表顺序" },
  { value: "reading", label: "按假名" },
  { value: "lemma", label: "按原型" },
];

interface ListState {
  items: VocabularyListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

type LoadState = "idle" | "loading" | "error" | "unauthorized" | "ready";

export function VocabularyBook() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("order");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<ListState | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [reloadNonce, setReloadNonce] = useState(0);

  // Debounce the search box so typing doesn't fire a request per keystroke.
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Reset to page 1 whenever the filters change.
  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, status, sort]);

  const requestId = useRef(0);
  useEffect(() => {
    const id = ++requestId.current;
    const controller = new AbortController();
    setLoadState("loading");

    const params = new URLSearchParams();
    if (debouncedQuery) params.set("q", debouncedQuery);
    if (status) params.set("status", status);
    params.set("sort", sort);
    params.set("page", String(page));

    fetch(`/api/vocabulary?${params.toString()}`, { signal: controller.signal })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (id !== requestId.current) return;
        if (res.status === 401) {
          setLoadState("unauthorized");
          return;
        }
        if (!res.ok || !body?.ok) {
          setErrorMessage(body?.message ?? "加载失败，请稍后重试。");
          setLoadState("error");
          return;
        }
        setData({
          items: body.items,
          page: body.page,
          pageSize: body.pageSize,
          total: body.total,
          totalPages: body.totalPages,
        });
        setLoadState("ready");
      })
      .catch((error) => {
        if (controller.signal.aborted || id !== requestId.current) return;
        console.error(error);
        setErrorMessage("网络异常，请检查连接后重试。");
        setLoadState("error");
      });

    return () => controller.abort();
  }, [debouncedQuery, status, sort, page, reloadNonce]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索汉字、假名或中文含义（如 学校 / がっこう / 学校）"
          className="w-full rounded-2xl border border-[#17241d]/15 bg-white/70 px-5 py-3 text-base outline-none focus:border-[#24705a]"
          aria-label="搜索单词"
        />

        <div className="flex flex-wrap items-center gap-2">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value || "all"}
              type="button"
              onClick={() => setStatus(f.value)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                status === f.value
                  ? "bg-[#17241d] text-white"
                  : "border border-[#17241d]/15 bg-white/60 text-[#17241d]/70 hover:border-[#24705a]"
              }`}
            >
              {f.label}
            </button>
          ))}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="ml-auto rounded-full border border-[#17241d]/15 bg-white/60 px-4 py-1.5 text-sm"
            aria-label="排序方式"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loadState === "loading" && data === null && (
        <p className="py-16 text-center text-[#17241d]/50">加载中…</p>
      )}

      {loadState === "unauthorized" && (
        <p className="py-16 text-center text-[#17241d]/60">
          请先登录后再浏览单词本。
        </p>
      )}

      {loadState === "error" && (
        <div className="py-16 text-center text-[#d94f3d]">
          <p>{errorMessage}</p>
          <button
            type="button"
            onClick={() => setReloadNonce((n) => n + 1)}
            className="mt-3 rounded-full border border-[#d94f3d]/40 px-4 py-1.5 text-sm"
          >
            重试
          </button>
        </div>
      )}

      {(loadState === "ready" || (loadState === "loading" && data !== null)) && data && (
        <>
          <p className="text-sm text-[#17241d]/50">
            共 {data.total} 个单词
            {loadState === "loading" && <span className="ml-2">更新中…</span>}
          </p>

          {data.items.length === 0 ? (
            <p className="py-16 text-center text-[#17241d]/50">
              没有匹配的单词，换个关键词或筛选条件试试。
            </p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.items.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/vocabulary/${item.id}`}
                    className="block h-full rounded-2xl border border-[#17241d]/10 bg-white/60 p-4 transition hover:border-[#24705a] hover:bg-white"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xl font-bold">{item.primaryWriting}</span>
                      <span className="shrink-0 rounded-full bg-[#f0c864]/40 px-2 py-0.5 text-xs">
                        {STATUS_LABELS[item.mastery.status] ?? item.mastery.status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-[#24705a]">{item.primaryReading}</p>
                    <p className="mt-2 line-clamp-2 text-sm text-[#17241d]/65">
                      {item.primaryMeaningZh ?? "（暂无释义）"}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {data.totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 pt-2">
              <button
                type="button"
                disabled={data.page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-full border border-[#17241d]/15 px-4 py-1.5 text-sm disabled:opacity-40"
              >
                上一页
              </button>
              <span className="text-sm text-[#17241d]/60">
                第 {data.page} / {data.totalPages} 页
              </span>
              <button
                type="button"
                disabled={data.page >= data.totalPages}
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                className="rounded-full border border-[#17241d]/15 px-4 py-1.5 text-sm disabled:opacity-40"
              >
                下一页
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

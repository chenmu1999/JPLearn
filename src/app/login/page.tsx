"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.ok) {
        router.push("/vocabulary");
        router.refresh();
        return;
      }
      setError(body?.message ?? "登录失败，请重试。");
    } catch {
      setError("网络异常，请检查连接后重试。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f3e9] px-6 text-[#17241d]">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-[#d94f3d] text-xl font-bold text-white">
            日
          </span>
          <h1 className="text-2xl font-black tracking-tight">JPLearn</h1>
          <p className="mt-1 text-sm text-[#17241d]/60">输入账号密码以体验单词模块</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-3xl border border-[#17241d]/10 bg-white/60 p-6 shadow-[0_20px_60px_rgba(23,36,29,0.10)]"
        >
          <label htmlFor="username" className="mb-2 block text-sm font-bold">
            账号
          </label>
          <input
            id="username"
            type="text"
            autoFocus
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full rounded-xl border border-[#17241d]/15 bg-white px-4 py-3 text-base outline-none focus:border-[#24705a]"
            placeholder="请输入账号"
          />

          <label htmlFor="password" className="mb-2 mt-4 block text-sm font-bold">
            密码
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-[#17241d]/15 bg-white px-4 py-3 text-base outline-none focus:border-[#24705a]"
            placeholder="请输入密码"
          />
          {error ? <p className="mt-3 text-sm font-medium text-[#d94f3d]">{error}</p> : null}
          <button
            type="submit"
            disabled={loading || username.length === 0 || password.length === 0}
            className="mt-5 w-full rounded-full bg-[#17241d] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#24705a] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "登录中…" : "登录"}
          </button>
        </form>
      </div>
    </main>
  );
}

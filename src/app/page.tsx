import Link from "next/link";

const plannedFeatures = [
  {
    label: "单词本",
    title: "JLPT N5 词汇",
    description: "浏览、搜索和按掌握状态筛选 718 个 N5 单词。",
    href: "/vocabulary/book",
  },
  {
    label: "练习",
    title: "从理解走向表达",
    description: "围绕薄弱知识点阅读例句并主动造句。",
    href: null,
  },
  {
    label: "反馈",
    title: "看见每一步进步",
    description: "通过掌握度记录和复习调度形成学习闭环。",
    href: null,
  },
];

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#f7f3e9] text-[#17241d]">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-8 sm:px-10 lg:px-12">
        <header className="flex items-center justify-between border-b border-[#17241d]/15 pb-5">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-full bg-[#d94f3d] text-lg font-bold text-white">
              日
            </span>
            <div>
              <p className="text-lg font-bold tracking-tight">JPLearn</p>
              <p className="text-xs text-[#17241d]/60">日本語を、少しずつ。</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/vocabulary"
              className="rounded-full bg-[#24705a] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#17241d]"
            >
              进入学习
            </Link>
            <Link
              href="/login"
              className="rounded-full border border-[#17241d]/15 bg-white/60 px-4 py-2 text-sm font-medium transition hover:border-[#24705a]"
            >
              登录
            </Link>
          </div>
        </header>

        <section className="grid items-center gap-14 py-16 lg:grid-cols-[1.2fr_0.8fr] lg:py-24">
          <div>
            <p className="mb-5 text-sm font-bold uppercase tracking-[0.25em] text-[#d94f3d]">
              Japanese learning, made active
            </p>
            <h1 className="max-w-3xl text-5xl font-black leading-[1.08] tracking-[-0.04em] sm:text-6xl lg:text-7xl">
              不只记住日语，
              <span className="block text-[#24705a]">更要真正用起来。</span>
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-[#17241d]/70">
              JPLearn 面向日语 N5 学习，把词汇和语法整理成可练习的知识点，
              通过例句、造句、反馈和复习，建立属于你的学习节奏。
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link
                href="/vocabulary/book"
                className="rounded-full bg-[#17241d] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#24705a]"
              >
                打开单词本
              </Link>
              <span className="text-sm text-[#17241d]/55">
                Next.js · TypeScript · Tailwind CSS
              </span>
            </div>
          </div>

          <div className="relative mx-auto aspect-square w-full max-w-md">
            <div className="absolute inset-8 rounded-full bg-[#f0c864]" />
            <div className="absolute inset-16 grid place-items-center rounded-full border border-[#17241d]/15 bg-[#fffaf0] shadow-[0_24px_80px_rgba(23,36,29,0.16)]">
              <div className="text-center">
                <p className="text-8xl font-black text-[#d94f3d]">学</p>
                <p className="mt-3 text-sm font-bold tracking-[0.3em] text-[#17241d]/55">
                  まなぶ
                </p>
              </div>
            </div>
            <span className="absolute left-2 top-12 rotate-[-8deg] rounded-full bg-[#24705a] px-4 py-2 text-sm font-bold text-white">
              読む
            </span>
            <span className="absolute bottom-12 right-0 rotate-[7deg] rounded-full bg-[#d94f3d] px-4 py-2 text-sm font-bold text-white">
              書く
            </span>
          </div>
        </section>

        <section className="grid gap-4 border-t border-[#17241d]/15 pt-8 md:grid-cols-3">
          {plannedFeatures.map((feature, index) => {
            const card = (
              <article className="h-full rounded-3xl border border-[#17241d]/10 bg-white/55 p-6 transition hover:border-[#24705a]">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-[#d94f3d]">{feature.label}</span>
                  <span className="text-xs text-[#17241d]/35">0{index + 1}</span>
                </div>
                <h2 className="mt-6 text-xl font-bold">{feature.title}</h2>
                <p className="mt-2 text-sm leading-6 text-[#17241d]/60">{feature.description}</p>
              </article>
            );
            return feature.href ? (
              <Link key={feature.label} href={feature.href} className="block">
                {card}
              </Link>
            ) : (
              <div key={feature.label}>{card}</div>
            );
          })}
        </section>
      </div>
    </main>
  );
}

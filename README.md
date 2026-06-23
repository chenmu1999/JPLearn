# JPLearn

<p align="center">
  <a href="#中文">中文</a> |
  <a href="#english">English</a> |
  <a href="#日本語">日本語</a>
</p>

> GitHub README does not support JavaScript-powered tabs. This README uses native GitHub anchors and collapsible language sections instead.

<details open>
<summary id="中文"><strong>中文</strong></summary>

JPLearn 是一个面向日语 N5 学习的 Web 工具，主要用于个人学习，也计划支持给他人试用。项目目标是把词汇和语法都整理为可练习的知识点，通过“阅读例句 -> 自己造句 -> AI 批改 -> 更新掌握度”的循环，帮助学习者从被动记忆逐步转向主动使用。

当前第一版规划：

- 使用现有 N5 资料导入知识点。
- 词汇和语法统一建模。
- 使用 DeepSeek v4 flash，经 OpenAI 兼容 API 生成例句和批改造句。
- 使用 SQLite + Prisma 保存练习记录和掌握状态。
- 使用 Next.js + TypeScript + Tailwind CSS 构建 Web 前端。
- 本机 Windows 开发，Ubuntu 虚拟机/Docker Compose 部署验证，后续可迁移到 Linux 服务器。

当前资料规模：

- N5 词汇：644 条。
- N5 语法：84 条。

项目仍处于设计和 MVP 准备阶段，详细规划见 `plan/` 目录。

</details>

<details>
<summary id="english"><strong>English</strong></summary>

JPLearn is a web-based Japanese N5 learning tool, primarily designed for personal study while remaining suitable for sharing with other learners. The core idea is to treat both vocabulary and grammar as practiceable knowledge points, then build a learning loop around reading example sentences, writing original sentences, receiving AI feedback, and updating mastery progress.

Initial MVP plan:

- Import existing N5 learning materials as knowledge points.
- Model vocabulary and grammar in a unified structure.
- Use DeepSeek v4 flash through an OpenAI-compatible API for example generation and sentence review.
- Store practice attempts and mastery state with SQLite + Prisma.
- Build the web app with Next.js, TypeScript, and Tailwind CSS.
- Develop locally on Windows, validate deployment on an Ubuntu VM with Docker Compose, and keep the project portable to Linux servers.

Current source material size:

- N5 vocabulary: 644 items.
- N5 grammar: 84 items.

The project is currently in the design and MVP preparation stage. See the `plan/` directory for detailed planning documents.

</details>

<details>
<summary id="日本語"><strong>日本語</strong></summary>

JPLearn は、日本語 N5 学習向けの Web ツールです。主に個人学習用として作りますが、ほかの学習者にも試してもらえる形を目指しています。語彙と文法をどちらも練習可能な知識ポイントとして扱い、「例文を読む -> 自分で文を作る -> AI に添削してもらう -> 習得度を更新する」という学習サイクルを作ることが目的です。

初期 MVP の方針：

- 既存の N5 学習資料を知識ポイントとして取り込む。
- 語彙と文法を統一したデータ構造で管理する。
- DeepSeek v4 flash を OpenAI 互換 API 経由で利用し、例文生成と作文添削を行う。
- SQLite + Prisma で練習履歴と習得状態を保存する。
- Next.js、TypeScript、Tailwind CSS で Web アプリを構築する。
- Windows で開発し、Ubuntu 仮想マシンと Docker Compose でデプロイを検証し、将来的に Linux サーバーへ移行できるようにする。

現在の資料規模：

- N5 語彙：644 項目。
- N5 文法：84 項目。

現在は設計と MVP 準備の段階です。詳しい計画は `plan/` ディレクトリを参照してください。

</details>

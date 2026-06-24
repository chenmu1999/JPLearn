# JPLearn

<p align="center">
  <a href="./README.md">中文</a> |
  <strong>English</strong> |
  <a href="./README.ja.md">日本語</a>
</p>

JPLearn is a web-based Japanese N5 learning tool, primarily designed for personal study while remaining suitable for sharing with other learners.

The goal is to treat both vocabulary and grammar as practiceable knowledge points, then build a learning loop around reading example sentences, writing original sentences, receiving AI feedback, and updating mastery progress.

## Initial MVP Plan

- Import existing N5 learning materials as knowledge points.
- Model vocabulary and grammar in a unified structure.
- Use DeepSeek v4 flash through an OpenAI-compatible API for example generation and sentence review.
- Store practice attempts and mastery state with SQLite + Prisma.
- Build the web app with Next.js, TypeScript, and Tailwind CSS.
- Develop locally on Windows and validate deployment on an Ubuntu VM. During testing, expose the app through an ngrok HTTPS tunnel instead of direct IPv6 access.

## Current Source Material

- N5 vocabulary: 644 items.
- N5 grammar: 84 items.

## Project Status

The formal Next.js project has been initialized and VM deployment testing is underway. See the [`plan/`](./plan/) directory for detailed planning documents.

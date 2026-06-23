# JPLearn

<p align="center">
  <strong>中文</strong> |
  <a href="./README.en.md">English</a> |
  <a href="./README.ja.md">日本語</a>
</p>

JPLearn 是一个面向日语 N5 学习的 Web 工具，主要用于个人学习，也计划支持给他人试用。

项目目标是把词汇和语法都整理为可练习的知识点，通过“阅读例句 -> 自己造句 -> AI 批改 -> 更新掌握度”的循环，帮助学习者从被动记忆逐步转向主动使用。

## 当前第一版规划

- 使用现有 N5 资料导入知识点。
- 词汇和语法统一建模。
- 使用 DeepSeek v4 flash，经 OpenAI 兼容 API 生成例句和批改造句。
- 使用 SQLite + Prisma 保存练习记录和掌握状态。
- 使用 Next.js + TypeScript + Tailwind CSS 构建 Web 前端。
- 本机 Windows 开发，Ubuntu 虚拟机/Docker Compose 部署验证，后续可迁移到 Linux 服务器。

## 当前资料规模

- N5 词汇：644 条。
- N5 语法：84 条。

## 项目状态

项目仍处于设计和 MVP 准备阶段。详细规划见 [`plan/`](./plan/) 目录。

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
- Windows 本机只书写源码，所有安装、编译、检查、测试、启动和部署均在 Ubuntu 虚拟机完成；测试期通过 ngrok 隧道访问，后续可迁移到正式 Linux 服务。

## 当前资料规模

- N5 词汇：644 条。
- N5 语法：84 条。

## 项目状态

正式 Next.js 工程已经初始化，目前正在进入 MVP 基础功能开发阶段。详细规划见 [`plan/`](./plan/) 目录。

## 开发与运行环境边界

Windows 工作区 `D:\Project\Web\JPLearn` 只用于查看、书写和修改源码及文档。禁止在 Windows 本机安装依赖、编译、构建、运行类型检查或 Lint、执行测试、启动服务、调用 DeepSeek API、操作项目数据库或部署。

项目使用 pnpm，但以下命令只能在 Ubuntu 虚拟机的项目目录中执行：

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm build
pnpm start --hostname 127.0.0.1 --port 3000
```

`hello-server/` 中的最小 Node.js 服务继续保留，作为最初的部署链路验证样例。当前测试环境使用 Ubuntu 虚拟机运行正式 Next.js 应用，并通过 ngrok 提供临时 HTTPS 地址。

## 虚拟机测试部署

当前虚拟机部署脚本为：

```text
scripts/deploy-vm.sh
```

脚本会在当前用户目录准备 Node.js 22 和 pnpm、安装依赖、执行生产构建，并将 Next.js 启动在 `127.0.0.1:3000`。ngrok 单独运行：

```bash
~/ngrok http 3000
```

ngrok 免费隧道地址可能在重启后变化，可在虚拟机中查询：

```bash
curl http://127.0.0.1:4040/api/tunnels
```

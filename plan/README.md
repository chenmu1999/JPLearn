# JPLearn 规划文档总览

## 当前状态

- 已完成最小 HelloWorld 服务和 ngrok 隧道链路验证。
- 已初始化 Next.js + TypeScript + Tailwind CSS 正式工程。
- 已完成 DeepSeek/OpenAI 兼容客户端、例句生成、练习批改、JSON 校验和错误归一化源码。
- 已在 Ubuntu 虚拟机通过 Lint、TypeScript 和生产构建，并部署到现有 ngrok 隧道。
- 已确认本地资料目录：
  - `D:\学习\日语\词汇\JLPT_N5_常用核心词汇表.csv`：644 个 N5 词汇。
  - `D:\学习\日语\语法\日语N5语法知识点大纲.csv`：84 个 N5 语法点。
- 已确定第一版方向：Windows 本机只书写源码，所有运行与验证均在 Ubuntu 虚拟机完成，后续可迁移 Linux 服务器。

## 文档索引

- `mvp-plan.md`：最初的 MVP 总计划。
- `product-design.md`：产品目标、学习闭环、页面和交互设计。
- `technical-design.md`：技术架构、数据模型、API、AI 调用和部署设计。
- `database-design.md`：Prisma/SQLite 数据库模型、字段、索引、导入策略和待确认决策。
- `architecture-design.md`：项目模块划分、职责边界、核心数据流和扩展点。
- `exercise-design.md`：基于 N5 真题的题型设计、知识点到题型映射和练习优先级。
- `kana-input-learning-design.md`：五十音识别、罗马音输入、假名输入的学习流程与验收标准。
- `phase-1-ngrok-hello-world.md`：测试期 ngrok 隧道部署目标、运行方式和验收标准。
- `execution-plan.md`：分阶段执行步骤、验收标准和虚拟机部署清单。

## 当前默认决策

- Windows 本机只允许查看、书写和修改源码与文档。
- 依赖安装、编译、构建、检查、测试、数据库操作、AI API 实际调用、启动和部署只能在 Ubuntu 虚拟机完成。
- 第一版单用户优先，不做账号体系。
- 使用 Next.js + TypeScript + Tailwind CSS。
- 使用 SQLite + Prisma 保存学习进度。
- AI 暂定接入 DeepSeek v4 flash，通过 OpenAI 兼容 API 生成例句和批改造句。
- AI 真实调用仍需在 Ubuntu 虚拟机的 `.env` 中配置 `OPENAI_API_KEY`；密钥不得保存到 Windows 工作区或提交到 Git。
- 测试期直接使用 Node.js/pnpm 部署到 Ubuntu 虚拟机；正式容器化阶段再使用 Docker Compose。
- 测试期公网访问使用 ngrok 隧道，不再使用 IPv6 直连。

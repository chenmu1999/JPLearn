# JPLearn 规划文档总览

## 当前状态

- 项目代码尚未初始化。
- 已确认本地资料目录：
  - `D:\学习\日语\词汇\JLPT_N5_常用核心词汇表.csv`：644 个 N5 词汇。
  - `D:\学习\日语\语法\日语N5语法知识点大纲.csv`：84 个 N5 语法点。
- 已确定第一版方向：本机开发、虚拟机部署验证、后续可迁移 Linux 服务器。

## 文档索引

- `mvp-plan.md`：最初的 MVP 总计划。
- `product-design.md`：产品目标、学习闭环、页面和交互设计。
- `technical-design.md`：技术架构、数据模型、API、AI 调用和部署设计。
- `database-design.md`：Prisma/SQLite 数据库模型、字段、索引、导入策略和待确认决策。
- `architecture-design.md`：项目模块划分、职责边界、核心数据流和扩展点。
- `exercise-design.md`：基于 N5 真题的题型设计、知识点到题型映射和练习优先级。
- `execution-plan.md`：分阶段执行步骤、验收标准和虚拟机部署清单。

## 当前默认决策

- 第一版单用户优先，不做账号体系。
- 使用 Next.js + TypeScript + Tailwind CSS。
- 使用 SQLite + Prisma 保存学习进度。
- AI 暂定接入 DeepSeek v4 flash，通过 OpenAI 兼容 API 生成例句和批改造句。
- 使用 Docker Compose 部署到 Ubuntu 虚拟机。

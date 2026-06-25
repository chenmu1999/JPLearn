# 项目架构设计

> 数据模型已在 `database-design.md` 定稿。本文中的模块职责必须遵守该文档；旧的“所有知识点共用一个掌握模型”不再适用于单词模块。

## 架构目标

JPLearn 第一版采用单体 Web 应用架构：Next.js 同时承载页面、API、数据访问和 AI 调用。这样本机开发简单，部署到 Ubuntu 虚拟机也直接；同时通过清晰的模块边界保留后续拆分能力。

核心原则：
- 页面组件只负责展示和用户交互。
- API Route 负责请求校验、调用业务服务、返回结果。
- 业务服务负责学习规则、AI 编排和数据写入。
- Prisma 只在服务层或数据访问层使用，不直接散落到页面组件。
- AI 供应商封装在 `lib/ai`，业务代码不依赖 DeepSeek 的具体实现细节。

## 顶层模块

计划目录结构：

```text
app/
  page.tsx
  practice/page.tsx
  knowledge/page.tsx
  knowledge/[id]/page.tsx
  settings/page.tsx
  vocabulary/
    page.tsx
    learn/page.tsx
    review/page.tsx
    book/page.tsx
    wrong/page.tsx
    settings/page.tsx
    [id]/page.tsx
  api/
    knowledge/route.ts
    knowledge/[id]/route.ts
    examples/route.ts
    attempts/route.ts
    mastery/[id]/reset/route.ts

components/
  layout/
  knowledge/
  practice/
  mastery/
  ui/

lib/
  ai/
  db/
  import/
  knowledge/
  mastery/
  practice/
  vocabulary/
  validation/

prisma/
  schema.prisma
  seed.ts

scripts/
  import-n5-data.ts

data/
  imported/

plan/
```

## 模块职责

### `app`

负责路由、页面组合和 API 入口。

- 页面文件只组合组件和调用服务端查询。
- API Route 不写复杂业务规则，只做参数读取、校验、调用 `lib` 服务、处理错误响应。
- 练习、例句生成、批改等会改变状态的行为都通过 API Route 进入。
- 练习题型选择由业务层根据知识点类型、掌握分数和题型优先级决定，页面只负责渲染对应题型。

### `components`

负责可复用 UI。

- `layout`：全局导航、页面外壳、状态栏。
- `knowledge`：知识点列表、筛选器、详情卡片。
- `practice`：练习题面、输入框、批改结果、下一题控制。
- `mastery`：掌握度徽标、统计卡片、进度展示。
- `ui`：按钮、输入框、标签、空状态、加载状态等基础组件。

组件不直接访问数据库，不直接调用 AI。

### `lib/db`

负责 Prisma Client 单例和数据库基础工具。

职责：
- 创建并复用 Prisma Client。
- 屏蔽开发环境热重载导致的重复连接问题。
- 提供少量通用数据库 helper。

### `lib/import`

负责资料导入。

职责：
- 读取 `data/vocabulary/jlpt/jlpt-vocabulary.csv` 并筛选 N5。
- 读取 N5 语法 CSV。
- 词汇映射为 `KnowledgePoint + VocabularyEntry + VocabularySense + VocabularyAcceptedForm`。
- 语法映射为通用知识点结构。
- 保证重复运行导入脚本不会制造重复数据。

词汇导入不预创建所有用户的掌握记录；`VocabularyMastery` 在首次分配、查询或操作时按需创建。

### `lib/knowledge`

负责知识点查询。

职责：
- 列表查询。
- 详情查询。
- 类型、分类、掌握状态、关键词过滤。
- 组装知识点和掌握状态的展示数据。

不负责更新掌握度，也不调用 AI。

### `lib/ai`

负责 AI 客户端和 prompt。

职责：
- 读取 `OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODEL`。
- 创建 OpenAI 兼容客户端。
- 封装 DeepSeek v4 flash 的调用。
- 提供 `generateExamples` 和 `reviewPracticeAttempt` 两个高层函数。
- 解析并校验 AI 返回 JSON。
- 将供应商错误转换成应用可展示的错误。

业务层只依赖这两个高层函数，不直接拼接 SDK 请求。

### `lib/practice`

负责练习流程。

职责：
- 选择下一题。
- 根据知识点类型选择具体题型。
- 提交用户练习答案。
- 调用 AI 批改。
- 保存练习提交记录和逐知识点评估明细。
- 调用掌握度模块逐项更新状态。
- 返回页面需要的批改结果。

练习模块是第一版的核心业务编排层。

### `lib/mastery`

负责语法和旧综合知识点的通用掌握度规则。

职责：
- 根据批改结果更新正确/错误次数。
- 根据批改结果更新 0-100 掌握分数。
- 不设置部分正确；每个受影响知识点只有正确或错误。
- 对单个知识点理解或使用正确加 20 分，错误减 10 分，最低 0 分，达到 100 分后标记为已掌握。
- 记录最近练习时间和掌握时间。
- 支持手动重置掌握状态。

单词不调用该模块，单词分维度掌握与复习规则由 `lib/vocabulary` 负责。

### `lib/vocabulary`

负责单词模块完整业务边界。

职责：

- 词条、义项、合法读音和表记查询。
- 学习计划与按时区生成每日固定分配。
- 创建和恢复 `VocabularyStudySession` 与持久化会话题目队列。
- 创建服务端 `VocabularyQuestion`，不向客户端暴露答案。
- 客观题判定、假名错误分类和幂等作答。
- 在事务中写入 `VocabularyAttempt`、更新 `VocabularyMastery`、会话队列和每日任务。
- 根据薄弱维度和到期时间安排复习。
- 严格排除同表记、同读音干扰项；候选不足时切换题型。
- 无有效例句时跳过语境题，并管理人工例句覆盖。
- 管理默认例句、AI 例句及用户级收藏、隐藏和反馈。

该模块内部继续区分 repository、纯逻辑规则和业务 service；页面和组件不能直接访问 Prisma。

### `lib/validation`

负责请求和 AI 响应校验。

职责：
- 校验 API 请求参数。
- 校验 AI JSON 返回结构。
- 统一错误消息。

第一版可以使用 Zod。

## 核心数据流

### 知识点浏览

```text
Page -> lib/knowledge -> Prisma -> Page/Components
```

页面读取知识点列表或详情，展示掌握状态和基础资料。该流程不依赖 AI。

### 例句生成

```text
Page -> POST /api/examples -> lib/knowledge -> lib/ai -> Prisma -> Response
```

流程：
1. API 校验 `knowledgePointId`。
2. 查询知识点。
3. 如果已有缓存例句，直接返回。
4. 如果没有缓存，调用 AI 生成。
5. 校验 AI JSON。
6. 保存例句。
7. 返回例句列表。

### 练习批改

```text
Page -> POST /api/attempts -> lib/practice -> lib/ai -> lib/mastery -> Prisma -> Response
```

流程：
1. API 校验知识点 ID、练习模式和用户答案。
2. 查询目标知识点。
3. 调用 AI 批改，要求返回逐知识点评估结果。
4. 校验 AI JSON，并把模型返回的知识点限定到数据库已有知识点。
5. 保存练习提交记录。
6. 保存每个受影响知识点的评估明细。
7. 按评估明细逐项更新掌握状态。
8. 返回整体反馈、修正句和每个知识点的加减分明细。

### 数据导入

```text
scripts/import-n5-data.ts -> lib/import -> Prisma
```

导入脚本只在开发、初始化或资料更新时运行，不在用户访问页面时运行。

### 单词学习

```text
Page -> vocabulary API -> lib/vocabulary service -> Prisma -> Response
```

流程：

1. 服务端读取或创建当日固定分配，并创建或恢复活动学习会话。
2. 从持久化会话项目生成并保存短期 `VocabularyQuestion`。
3. 客户端提交 `questionId` 和答案。
4. 服务端判题并分类错误。
5. 在同一事务中保存 `VocabularyAttempt`、更新分维度掌握、会话重试队列、复习时间和任务进度。
6. 返回结果和下一题导航，不让客户端指定分数或正确性。

## 错误处理边界

- AI 配置缺失：页面可浏览，生成和批改接口返回明确配置错误。
- AI 响应不是合法 JSON：保存原始错误上下文，不更新掌握度。
- 数据库写入失败：返回通用失败消息，服务端记录详细错误。
- 找不到知识点：返回 404。
- 用户输入为空或过长：返回 400。

## 后续扩展点

- 多用户：核心学习表从第一版起均保留 `userId`，公开服务阶段替换临时 Session 和默认用户。
- PostgreSQL：保持 Prisma 模型不变，替换 `DATABASE_URL` 和迁移配置。
- 更多等级资料：导入模块增加 `level` 字段和不同资料源映射。
- 更多练习模式：语法与综合练习扩展 `lib/practice`；单词卡片、选择题和听写扩展 `lib/vocabulary`，复用 `VocabularyMastery` 和 `VocabularyAttempt`。

# 单词模块详细执行计划

## 1. 目标与执行边界

本计划用于把 `vocabulary-module-design.md` 拆解为可以依次实现、验证和交付的开发任务。

最终目标：

- 单词成为独立于语法和综合练习的一级模块。
- 用户可以制定每日新词计划，完成新词学习和到期复习。
- 系统分别记录读音、假名拼写、词义、表记和语境能力。
- 基础背词流程不依赖 AI，也不依赖付费。
- AI 根据当前单词和用户已掌握知识生成个性化例句，作为付费权益。
- 后续可以扩展 N4/N3 词书、音频、开放式造句和真实支付。

环境边界：

- Windows 工作区只允许查看、编写和修改源码及文档。
- 本计划中的安装依赖、数据库迁移、数据导入、测试、Lint、类型检查、构建、AI 实际调用和服务启动，全部在 Ubuntu 虚拟机执行。
- Windows 完成每一批源码修改后，只报告“源码已修改，尚未运行验证”。
- 每个阶段的验收必须在源码同步到 Ubuntu 虚拟机后完成。

## 2. 当前项目基线

截至本计划编写时，当前源码已经具备：

- Next.js App Router、TypeScript、React 和 Tailwind CSS。
- OpenAI 兼容 AI 客户端、JSON 解析、例句生成和练习批改基础封装。
- 临时登录、Session Cookie 和 AI 联调接口。
- 首页和临时 AI 对话界面。

当前尚未具备：

- Prisma 和 SQLite 依赖。
- Prisma Schema、迁移和数据库客户端。
- N5 词汇导入。
- 单词专用数据模型。
- 单词学习计划和复习调度。
- 单词页面、接口和组件。
- AI 例句权益与额度。

因此必须先建立数据层，再实现业务服务，最后接页面。不能先用前端假数据把完整流程写死。

## 3. 实施总览

| 里程碑 | 目标 | 主要产物 | 前置条件 |
| --- | --- | --- | --- |
| M0 | 锁定规则与样例 | 规则常量、验收样例 | 无 |
| M1 | 数据基础 | Prisma、Schema、迁移、种子用户 | M0 |
| M2 | 词汇导入 | 导入器、数据校验报告 | M1 |
| M3 | 单词查询 | Repository、详情/列表 API | M2 |
| M4 | 学习计划 | 每日新词任务、学习状态 | M3 |
| M5 | 客观题引擎 | 出题、判题、错误分类 | M4 |
| M6 | 复习调度 | 到期复习、错词本、阶段间隔 | M5 |
| M7 | 学习界面 | 首页、学习页、复习页、单词本 | M3-M6 |
| M8 | AI 个性化例句 | 上下文筛选、生成、缓存、反馈 | M3、M6 |
| M9 | 权益和额度 | 服务端鉴权、消费流水 | M8 |
| M10 | 稳定化 | 测试、构建、数据回归、文档 | M1-M9 |

M1-M7 构成免费基础背词 MVP。M8-M9 构成付费 AI 例句 MVP。

## 4. 已锁定的第一版规则

以下规则应先写成代码常量或配置，避免散落在页面和接口中。

### 4.1 学习范围（已扩展）

> 实现变更：初版锁定为「单用户 / 仅 N5 718 词 / 单一计划 / 按词表序」。当前实现已扩展为账号登录、N1–N5 全量导入、多计划并行、按词频排序。下列为现状。

- 词书：JLPT N1–N5 全部等级（由易到难 `N5,N4,N3,N2,N1`），共 8131 词（N1:2699 N2:1906 N3:2140 N4:668 N5:718）。
- 权威导入源：`data/vocabulary/jlpt/jlpt-vocabulary.csv`，通过 `scripts/import-jlpt-vocabulary.ts`（`--all` 或 `--level=Nx`）按等级导入。
- 用户：账号密码登录（`Account` 模型，第一版单账号 `admin` 关联种子 `UserProfile`）。
- 学习计划：支持**多个并行 `ACTIVE` 计划**，每个绑定单一等级，按 `planId` 隔离。
- 每日新词默认值：`10`；可选范围 `5-50`。
- 每日新词实际数量：**自适应均摊** `todayTarget = min(剩余新词, max(1, ceil(剩余新词 / 剩余天数)))`，漏背自动补偿。`dailyNewCount` 仅作为创建时的目标速度。
- 计划创建模式：`BY_DAILY`（定每日量推天数）与 `BY_END_DATE`（定结束日推每日量），互相推导。
- 单次学习任务：先完成新词，再提示进入复习；用户可以主动切换顺序。
- 核心能力维度：读音、假名拼写、词义。
- 辅助能力维度：表记、语境。

### 4.2 第一版掌握阈值

使用离散分数，初始均为 `0`，范围为 `0-100`：

- 独立正确：对应维度 `+20`。
- 使用提示后正确：对应维度 `+5`。
- 错误：对应维度 `-10`，最低为 `0`。
- 单词进入 `MASTERED`：`readingScore`、`spellingScore`、`meaningScore` 均达到 `80`，且最近一次主动输入题正确。
- 表记和语境分数第一版参与展示和选题，但不阻止基础掌握。

这些值先集中放入 `src/lib/vocabulary/config.ts`，后续可以调整，不直接写入组件。

### 4.3 第一版复习间隔

```text
Stage 0：学习后 10 分钟
Stage 1：1 天
Stage 2：3 天
Stage 3：7 天
Stage 4：14 天
Stage 5：30 天
```

规则：

- 本轮要求的能力题全部独立正确：阶段 `+1`。
- 本轮出现错误：`reviewStage = max(0, reviewStage - 1)`，`nextReviewAt = now + 10 分钟`。
- 使用提示后正确：阶段不变，按当前阶段间隔设置 `nextReviewAt`。
- Stage 5 独立正确后继续保持 Stage 5，并设置 30 天后复习。
- 已掌握词答错：保留 `masteredAt`，状态改为 `REVIEWING`，按错误规则回退阶段并在 10 分钟后复习。
- `nextReviewAt` 由服务端生成，客户端不能提交。

### 4.4 第一版题型

必须实现：

- `WRITING_TO_READING_INPUT`：表记到假名输入。
- `READING_TO_MEANING_CHOICE`：假名到中文选择。
- `MEANING_TO_WORD_CHOICE`：中文到日语选择。
- `CONTEXT_WORD_CHOICE`：例句语境选词。

第二批再实现：

- `READING_TO_WRITING_CHOICE`。
- `AUDIO_TO_READING_INPUT`。
- `INFLECTION_TO_LEMMA`。
- `SENTENCE_WRITING`。

### 4.5 默认例句策略

- CSV 中存在可用例句时导入为 `SOURCE`。
- 第一版建立独立的人工审核 `CURATED` 例句数据，目标覆盖全部 718 条 N5 来源词条（基础词条导入已覆盖 N1–N5，但人工例句第一版仍只针对 N5）。
- 没有有效例句时允许单词暂时无例句，学习卡和其他基础题型仍可使用。
- 没有有效例句的词条跳过 `CONTEXT_WORD_CHOICE`，不能为了出题实时调用 AI。
- 已保存且未被当前用户隐藏的 AI 例句可以作为后续语境题素材。
- 基础学习不能在进入单词卡时自动调用 AI。

## 5. 目标目录结构

在当前 `src` 结构基础上增加：

```text
src/
  app/
    vocabulary/
      page.tsx
      learn/page.tsx
      review/page.tsx
      book/page.tsx
      wrong/page.tsx
      settings/page.tsx
      [id]/page.tsx
    api/
      vocabulary/
        dashboard/route.ts
        route.ts
        [id]/route.ts
        learn/next/route.ts
        review/next/route.ts
        attempts/route.ts
        sessions/route.ts
        sessions/[id]/abandon/route.ts
        plan/route.ts
        [id]/reset/route.ts
        [id]/suspend/route.ts
        [id]/examples/route.ts
        [id]/examples/generate/route.ts
        [id]/examples/[exampleId]/favorite/route.ts
        [id]/examples/[exampleId]/feedback/route.ts
  components/
    vocabulary/
      vocabulary-dashboard.tsx
      vocabulary-card.tsx
      vocabulary-answer-input.tsx
      vocabulary-choice-question.tsx
      vocabulary-result.tsx
      vocabulary-progress.tsx
      vocabulary-list.tsx
      vocabulary-filters.tsx
      vocabulary-example.tsx
      vocabulary-example-generator.tsx
  lib/
    db/
      client.ts
    vocabulary/
      config.ts
      types.ts
      schemas.ts
      normalize-answer.ts
      classify-error.ts
      question-builder.ts
      answer-evaluator.ts
      mastery-service.ts
      review-scheduler.ts
      study-plan-service.ts
      study-session-service.ts
      vocabulary-repository.ts
      vocabulary-service.ts
      example-context.ts
      example-service.ts
    entitlement/
      entitlement-service.ts
      usage-service.ts
prisma/
  schema.prisma
  seed.ts
scripts/
  import-n5-vocabulary.ts
  validate-n5-vocabulary.ts
  import-n5-curated-examples.ts
  validate-n5-curated-examples.ts
```

文件可以根据实现情况合并，但职责边界必须保持：

- Route 只做认证、参数校验、调用服务和转换 HTTP 响应。
- Repository 只负责数据库读写。
- Service 负责业务事务和规则编排。
- 判题、错误分类和复习算法必须是无 UI 依赖的纯逻辑。
- 组件不能直接访问 Prisma 或 AI SDK。

## 6. M0：规则固化与验收样例

### 6.1 任务

- 建立单词模块枚举和 TypeScript 类型草案。
- 建立题型、能力维度、错误类型、学习状态、例句来源类型常量。
- 整理至少 20 个代表性 N5 单词作为验收样例。
- 样例必须覆盖：
  - 纯假名词。
  - 常用汉字词。
  - 片假名外来语。
  - 浊音和半浊音。
  - 促音。
  - 拨音。
  - 长音。
  - 拗音和小假名。
  - 动词。
  - い形容词和な形容词。
  - 多个可接受表记或读音的情况。

### 6.2 建议产物

```text
src/lib/vocabulary/types.ts
src/lib/vocabulary/config.ts
data/fixtures/vocabulary-acceptance.json
```

验收样例只用于测试和验收，不替代正式 CSV 导入。

### 6.3 完成标准

- 所有业务状态有稳定英文枚举值。
- 页面展示文案与内部枚举分离。
- 20 个样例的预期答案和错误类型经过人工确认。
- 后续数据模型和接口均引用同一套枚举。

## 7. M1：数据库与基础模型

### 7.1 Ubuntu 依赖任务

在 Ubuntu 虚拟机安装并锁定：

- `prisma`
- `@prisma/client`
- `zod`，如果项目尚未加入
- CSV 解析库，或使用项目确认的轻量解析方案

安装完成后同步 `package.json` 和锁文件的变更回工作区。

### 7.2 Prisma 模型

第一批建立：

- `UserProfile`
- `KnowledgePoint`
- `VocabularyEntry`
- `VocabularySense`
- `VocabularyAcceptedForm`
- `VocabularyExample`
- `VocabularyMastery`
- `VocabularyAttempt`
- `VocabularyStudyPlan`
- `VocabularyDailyAssignment`
- `VocabularyStudySession`
- `VocabularySessionItem`
- `VocabularyQuestion`

第二批 AI 权益再增加：

- `AiEntitlement`
- `AiUsageRecord`
- `VocabularyExampleFeedback`

### 7.3 关键约束

- `KnowledgePoint.sourceKey` 唯一。
- `VocabularyEntry.knowledgePointId` 唯一。
- `VocabularyEntry.sourceKey` 唯一。
- `(userId, vocabularyId)` 在 `VocabularyMastery` 中唯一。
- 一个用户可以有多个启用中（`ACTIVE`）的词汇学习计划，每个绑定单一等级；按 `planId` 隔离取词。
- `VocabularyAcceptedForm` 对同一单词、类型和值唯一。
- `VocabularySense` 对同一词条的显示顺序唯一。
- `VocabularyAttempt.questionId` 唯一。
- 每日分配按 `planId`、日期、词条和任务类型唯一；同一 `planId`、日期、任务类型下 `order` 唯一。
- 同一会话内 `VocabularySessionItem.sequence` 唯一。
- 同一用户同一会话类型最多一个活动会话，由服务事务保证。
- 所有分数由应用层限制在 `0-100`。
- `nextReviewAt`、`lastReviewedAt` 建立组合查询所需索引。
- 删除单词时相关掌握、作答和例句应按设计级联或拒绝删除，不能留下孤儿记录。

### 7.4 时间处理

- 数据库存储 UTC 时间。
- “今日任务”按用户时区计算，第一版默认 `Asia/Shanghai`。
- 学习计划保存 `timezone` 字段，避免以后更换服务器时日期边界变化。
- API 返回 ISO 8601 时间，页面负责本地展示。

### 7.5 事务边界

以下操作必须使用数据库事务：

- 保存一次作答、更新能力分数、更新复习阶段和下次复习时间。
- 成功生成 AI 例句、记录额度消费。
- 重置单词时同步清理或重置当前掌握状态。

### 7.6 Ubuntu 验收

- Prisma Schema 校验通过。
- 迁移可以在空数据库执行。
- seed 可以幂等创建默认用户。
- 重复执行 seed 不产生重复用户。
- 数据库文件位于部署时可持久化的位置。

## 8. M2：N5 词汇导入

### 8.1 数据源

当前唯一权威数据源：

```text
data/vocabulary/jlpt/jlpt-vocabulary.csv
```

通用导入脚本 `scripts/import-jlpt-vocabulary.ts`（`pnpm db:import:jlpt`）支持 `--all` 或 `--level=Nx`，按等级校验计数。当前已导入 N1–N5 全部 8131 条（N1:2699 N2:1906 N3:2140 N4:668 N5:718）。`n1.csv` 至 `n5.csv` 只用于来源追溯，不作为应用导入入口。不得让运行中的 Web 请求读取 Windows 工作区外部路径。

### 8.2 字段映射

基础映射：

| CSV | 目标 |
| --- | --- |
| `id` | `KnowledgePoint.sourceKey`、`VocabularyEntry.sourceKey` |
| `level` | `KnowledgePoint.level`、`VocabularyEntry.level` |
| `expression` | `VocabularyEntry.lemma`、`primaryWriting` |
| `reading` | `VocabularyEntry.primaryReading` |
| `meaning_zh` | 主要 `VocabularySense` |
| `meaning_en` | `VocabularyEntry.meaningEn` |
| `source_guid` | `VocabularyEntry.sourceGuid` |
| `source` | `KnowledgePoint.sourceName` |

导入时同时创建：

- `KnowledgePoint(kind=VOCABULARY)`。
- `VocabularyEntry`。
- 主要读音 `VocabularyAcceptedForm(READING)`。
- 主要表记 `VocabularyAcceptedForm(WRITING)`。
- 主要中文释义 `VocabularySense(isPrimary=true)`。

导入时不预创建默认用户的全部 `VocabularyMastery`；用户首次分配、查询或操作词条时按需 upsert。

### 8.3 数据清洗

导入器必须显式处理：

- UTF-8 BOM。
- 空白字符。
- 全角和半角符号。
- 缺失读音。
- 缺失中文释义。
- 同一来源序号重复。
- 同一单词不同读音。
- 一个字段中使用分隔符保存多个释义。
- 纯假名词的 `lemma` 与 `primaryWriting`。
- 同形同音但来源义项不同的多行记录。

不能在遇到异常数据时静默丢弃。每条异常至少进入导入报告。

当前统一 CSV 没有可靠的结构化词性、分类和默认例句。第一版允许对应字段为空，不根据英文释义猜测后写入正式字段。

### 8.4 人工例句数据

建立独立受控数据文件，例如：

```text
data/vocabulary/examples/n5-curated.json
```

每条例句至少包含：

```text
sourceKey
japanese
chinese
targetSurface
usageNoteZh
```

要求：

- 目标覆盖全部 718 条 N5 来源词条。
- 每条例句经过人工审核后才标记为 `CURATED`。
- 导入时校验 `sourceKey` 存在。
- 校验目标表记或合法活用形式出现在日语例句中。
- 重复导入按稳定键更新，不制造重复默认例句。
- 输出总覆盖率、缺失词条、重复默认例句和目标词缺失报告。
- 缺少例句不阻断词汇基础数据导入，但该词条不能生成语境题。

### 8.4 幂等策略

- 以 CSV 的稳定 `id` 作为 `sourceKey` upsert。
- 已存在数据更新可维护字段。
- 不覆盖用户学习记录。
- 数据源删除某一行时，第一版只报告“来源缺失”，不自动删除数据库中的单词。

### 8.5 导入报告

脚本结束时输出：

- 总行数。
- 新增数。
- 更新数。
- 跳过数。
- 错误数。
- 缺失读音数。
- 缺失释义数。
- 重复来源键。
- 多值字段数量。

同时支持只校验不写库的 `validate` 模式。

### 8.6 Ubuntu 验收

- 各等级活跃来源词条与数据源预期一致：N1–N5 共 8131（N5 718、N4 668、N3 2140、N2 1906、N1 2699）。
- 随机抽查至少 20 条映射。
- 代表性验收样例全部能查询。
- 重复导入不会增加总数。
- 修改一条来源数据后重新导入，只更新对应记录。
- 无合法读音或释义的数据会被报告。

## 9. M3：单词查询与只读页面

### 9.1 Repository

实现：

- 按 ID 获取单词详情。
- 分页查询单词。
- 按汉字、假名和中文含义搜索。
- 按词性、状态、分类、等级筛选。
- 查询用户分维度掌握状态。
- 查询默认例句和已收藏例句。

列表查询必须分页，不能一次返回全部词汇。

### 9.2 API

#### `GET /api/vocabulary`

查询参数：

```text
page
pageSize
q
status
partOfSpeech
category
level
sort
```

服务端限制 `pageSize` 最大值，避免任意大查询。

#### `GET /api/vocabulary/:id`

返回：

- 单词基础信息。
- 可接受读音和表记。
- 默认例句。
- 当前用户掌握状态。
- 最近作答摘要。
- AI 权益摘要；只返回前端展示所需字段。

### 9.3 只读页面

优先完成：

- `/vocabulary/book`
- `/vocabulary/[id]`

此时暂不实现学习流程，但应能完整检查导入数据和展示结构。

### 9.4 完成标准

- 搜索「学校」、`がっこう` 或对应中文含义均能得到目标词。
- 筛选与分页可以组合。
- 无结果、加载失败和字段缺失都有明确界面。
- 未配置 AI 时详情页正常展示默认内容。
- 不向客户端返回 AI 原始响应或内部成本字段。

## 10. M4：学习计划和今日任务

### 10.1 学习计划服务

实现：

- 创建或更新学习计划。
- 获取当前有效计划。
- 计算今天可引入的新词数量。
- 从 `NEW` 单词中稳定选择今日新词。
- 防止用户重复刷新导致今日任务变化。

必须增加“每日任务分配”记录。只依赖动态查询会导致同一天的词表在状态变化后漂移。

正式模型：

```text
VocabularyDailyAssignment
- id
- userId
- planId           // 所属计划，分配按计划隔离
- localDate
- vocabularyId
- assignmentType   // NEW, REVIEW
- order
- completedAt
```

NEW 分配必须固定。REVIEW 可以按 `nextReviewAt` 动态补入，但写入当日分配后同样保持稳定。

### 10.2 新词选择顺序（已改为词频优先）

> 实现变更：原规划按数据源序号升序。现改为语料库词频优先，解决相似词扎堆问题。

默认 `orderBy`：

1. `status=NEW`（已暂停单词排除）。
2. `level`（计划绑定等级）。
3. `frequencyRank` 升序，`nulls last`（1 最常用；未命中词频表的词排末尾）。
4. `sourceOrder` 升序（兜底，保证可重复）。
5. 同一日期创建固定分配。

`frequencyRank` 由 Leeds 日语语料库词频表回填（`scripts/backfill-frequency-rank.ts`，N5 覆盖 96.1%）。仅影响尚未学到的词，不打乱已学进度；顺序仍可重复、可解释。

### 10.3 API

```text
GET  /api/vocabulary/dashboard
GET  /api/vocabulary/learn/next
GET    /api/vocabulary/plans            // 列出计划（含进度 PlanDTO）
POST   /api/vocabulary/plans            // 新建计划（BY_DAILY / BY_END_DATE）
GET    /api/vocabulary/plans/[id]       // 单个计划进度
PATCH  /api/vocabulary/plans/[id]       // 更新计划
DELETE /api/vocabulary/plans/[id]       // 归档/删除计划
```

> 实现变更：原规划为单计划 `GET/PUT /api/vocabulary/plan`，现为多计划 REST 资源 `/api/vocabulary/plans(+/[id])`。`learn/next`、`review/next`、`sessions` 均透传 `planId`。

`dashboard` 返回：

- 今日新词总数和剩余数。
- 今日复习总数和剩余数。
- 逾期复习数。
- 总词数、已学习数、已掌握数。
- 三个核心能力平均值。

### 10.3.1 进行中计划的随时调整（详见 design §4.1.1）

`ACTIVE` 计划允许随时调整节奏，无需删除重建：

- `PATCH /api/vocabulary/plans/[id]` 接收 `dailyCount`（改每日量，推导结束日）或 `endDate`（改结束日，推导每日量），二选一。
- 重算基准为**剩余未学词数** `countRemainingNewWords(planId, level)`，已学进度保留。
- 服务端原子更新 `dailyNewCount` 与 `targetCompletedAt`；这两个派生值不接受客户端直接写入。
- 不重排/不删除已生成的当日 `NEW` 分配（防漂移），新节奏从下一次分配生成起生效。

实现现状：服务层 `updatePlanById` 与 PATCH 路由已就绪；`/vocabulary/plans/[id]` 进度页的「调整学习节奏」UI（`AdjustPace` 组件）已落地，带实时预览（以剩余未学词数为基准的「剩余 N 词 · 每天约 X 词 · 预计 Y 天」）。源码已实现，待 VM 验证。

### 10.4 完成标准

- 同一天重复进入时新词列表不变化。
- 修改每日新词数不会重复分配已有单词。
- 跨天后生成新的任务。
- 时区边界按 `Asia/Shanghai` 计算。
- 没有剩余新词时返回明确完成状态。
- 进行中计划可随时调整每日量或结束日期，按剩余词数重算且不影响已学进度。

## 11. M5：客观题与判题引擎

### 11.1 出题器

输入：

- 单词信息。
- 用户各维度分数。
- 最近错误。
- 当前是新词学习还是复习。

输出：

```ts
type VocabularyQuestion = {
  questionId: string;
  vocabularyId: string;
  exerciseType: VocabularyExerciseType;
  prompt: unknown;
  options?: Array<{ id: string; text: string }>;
  targetDimension: VocabularyDimension;
};
```

正确答案不能直接返回给答题前的客户端。`questionId` 应关联服务端可验证的题目内容，避免用户自行提交任意单词和“正确答案”。

第一版采用数据库保存的 `VocabularyQuestion` 短期题目实例。标准答案只保存在服务端字段中，不返回答题前客户端；题目必须包含过期时间。

### 11.2 干扰项生成

选择题干扰项优先来自数据库，不使用 AI：

- 同词性。
- 同等级。
- 中文含义相近但不相同。
- 假名长度或表记形式相近。
- 排除目标词的可接受答案。
- 排除任一规范化合法表记与目标词相同的词条。
- 排除任一规范化合法读音与目标词相同的词条。

排除规则覆盖 `primaryWriting`、`primaryReading` 和全部 `VocabularyAcceptedForm`，任何阶段都不能放宽。严格排除后不足 3 个合理干扰项时，出题器改用该词条的其他可用题型；如果没有可用题型，将当前会话项目标记为 `SKIPPED` 并记录原因。

### 11.3 答案规范化

`normalize-answer.ts` 负责：

- Unicode 规范化。
- 去除首尾空白。
- 统一可接受标点。
- 片假名和平假名是否等价由题型决定。
- 不自动把长音、促音、清浊音错误改成正确答案。
- 不把汉字转换结果自动视为假名输入正确。

### 11.4 错误分类

先做确定性比较：

1. 完全相等：正确。
2. 假名脚本不同但音值相同：`SCRIPT_CONFUSION`。
3. 清浊音差异：`DAKUON_HANDAKUON`。
4. 大小假名差异：`SMALL_KANA`。
5. 促音差异：`SOKUON`。
6. 长音差异：`LONG_VOWEL`。
7. 拨音差异：`MORAIC_N`。
8. 其他编辑距离差异：`KANA_SPELLING`。
9. 选择题选错含义：`MEANING_CONFUSION`。

错误分类应接受“用户答案、标准答案、题型”作为输入并返回稳定结果，不依赖页面文案。

### 11.5 作答服务

`POST /api/vocabulary/attempts`：

```json
{
  "questionId": "server-issued-id",
  "answer": "がっこう",
  "usedHint": false,
  "responseTimeMs": 4200
}
```

服务端事务：

1. 校验 Session。
2. 读取并验证题目。
3. 判定正确性和错误类型。
4. 创建 `VocabularyAttempt`。
5. 更新目标维度分数。
6. 更新最近错误。
7. 更新当前 `VocabularySessionItem`。
8. 答错时按规则创建延迟 3 道题的重试项目，最多 2 次。
9. 根据本轮状态更新复习阶段。
10. 标记每日任务和会话进度。
11. 返回结果和下一题导航信息。

### 11.6 安全限制

- 限制答案长度。
- `responseTimeMs` 仅作为统计参考，不作为安全可信数据。
- 防止同一 `questionId` 重复提交并重复加分。
- 已提交题目重复请求应返回原结果或幂等冲突，不重复写入。
- 客户端不能指定分数变化、错误类型或是否正确。

### 11.7 完成标准

- 三个不依赖例句的基础题型始终能生成和提交。
- 存在有效例句时能生成和提交 `CONTEXT_WORD_CHOICE`；无例句时安全跳过。
- 代表性假名错误可以正确分类。
- 重复提交不重复加分。
- 同一事务中作答保存和掌握度更新保持一致。
- AI 配置关闭时全部客观题仍可使用。

## 12. M6：复习调度和错词本

### 12.0 学习会话

所有新词学习、普通复习和错词专项练习均创建或恢复 `VocabularyStudySession`。

- 会话类型为 `LEARN`、`REVIEW` 或 `WRONG_BOOK`。
- 初次创建时根据每日分配或专项筛选生成 `VocabularySessionItem`。
- 每个会话项目代表一次计划出题，状态、顺序、目标维度和重试次数保存在数据库。
- 同一用户再次进入相同类型学习时恢复活动会话。
- 已提交题目不会因刷新重复记分。
- 用户主动放弃时会话标记为 `ABANDONED`；已完成作答和掌握变化保留。
- 全部非跳过项目完成后，会话标记为 `COMPLETED` 并生成结果统计。

接口：

```text
POST /api/vocabulary/sessions
POST /api/vocabulary/sessions/:id/abandon
```

创建接口接收会话类型并返回新会话或同类型现有活动会话。`learn/next` 和 `review/next` 只从对应活动会话读取下一项目。

### 12.1 复习查询

到期条件：

```text
status in (LEARNING, REVIEWING, MASTERED)
nextReviewAt <= now
status != SUSPENDED
```

固定排序：

1. 逾期时间最长。
2. 最近答错。
3. 最薄弱核心维度分数最低。
4. `nextReviewAt` 升序。

### 12.2 题型选择

- `readingScore` 最低：优先表记到假名。
- `spellingScore` 最低：优先主动假名输入。
- `meaningScore` 最低：优先假名到词义或中文到日语。
- 最近存在特定假名错误：继续安排输入题。
- 三项接近：轮换题型，避免连续同构题。

### 12.3 本轮重现

- 答错的单词在若干题后重新出现，不能立即原题重复造成短时记忆假象。
- 答错后间隔 3 道其他题再重现；不足 3 道时放到本轮末尾。
- 同一词条每轮最多重试 2 次，避免无限阻塞。
- 达到上限仍错误时，展示学习卡并安排近期复习。
- 重现通过新增 `VocabularySessionItem` 持久化，不使用仅存在于前端内存的临时数组。

### 12.4 错词本

查询维度：

- 最近 7 天错误。
- 最近 30 天错误。
- 按错误类型。
- 按核心能力维度。
- 连续错误次数。

错词专项练习仍写入统一的 `VocabularyAttempt`，但保存来源 `WRONG_BOOK`。

### 12.5 完成标准

- 到期单词能进入复习队列。
- 答对后 `nextReviewAt` 按阶段前移。
- 答错后不会继续保持过远复习时间。
- 错词能按类型筛选并开始专项练习。
- 已掌握词答错后会重新进入有效复习，而不是永久隐藏。

## 13. M7：前端学习体验

### 13.1 单词模块首页

实现顺序：

1. 今日新词和今日复习卡片。
2. 总体进度。
3. 读音、拼写、词义维度概览。
4. 最近错词。
5. AI 例句权益入口，M9 前可隐藏或显示“即将开放”。

### 13.2 学习页状态机

建议页面状态：

```text
LOADING
STUDY_CARD
QUESTION
SUBMITTING
RESULT
SESSION_COMPLETE
ERROR
```

状态必须显式管理，避免依靠多个布尔值形成冲突。

流程：

```text
新词卡 → 熟悉度选择 → 练习题 → 结果 → 下一题
                               ↓
                         本轮错词重现
```

### 13.3 输入体验

- 输入题自动聚焦。
- Enter 提交，但提交中禁用重复操作。
- 使用中文输入法时避免在 IME composition 未结束时误提交。
- 明确显示题目要求平假名还是片假名。
- 错误结果按字符位置标记。
- 移动端输入框和按钮保持足够点击区域。

### 13.4 断点恢复

- 页面刷新后根据 `VocabularyStudySession` 和 `VocabularySessionItem` 恢复当前题序、重试队列和完成进度。
- 不能只把当前学习进度保存在 React 内存。
- 未提交答案可以不恢复；已完成题目不能重复记分。

### 13.5 无障碍与可读性

- 发音按钮有文本标签。
- 正确和错误不能只依靠颜色区分。
- 日语正文使用适合假名和汉字显示的字体栈。
- 中文释义与日语正文视觉层级清楚。

### 13.6 完成标准

- 桌面和手机宽度均可完成完整学习流程。
- 刷新后不会丢失已经计入的进度。
- 加载、无任务、失败、提交中、完成均有独立状态。
- 用户可以从结果页回看读音、释义和例句。

## 14. M8：AI 个性化例句

### 14.1 复用与调整现有 AI 层

当前已有 `src/lib/ai`，新增单词例句能力时：

- 复用客户端、配置、错误归一化和 JSON 解析。
- 不修改基础单词学习使其依赖 AI。
- 新增面向单词的高层函数，例如 `generateVocabularyExample`。
- prompt 版本单独维护，例如 `vocabulary-example-v1`。

### 14.2 已掌握知识筛选

不要把全部已掌握知识发送给模型。第一版固定限制：

- 最多 30 个已掌握单词。
- 最多 15 个已掌握语法点。
- 固定加入生成自然句所需的基础功能词白名单。

候选评分：

```text
同分类 +3
最近学习 +2
最近复习 +2
基础高频 +2
在默认例句中出现 +1
```

取分数最高的一组，并去掉目标单词本身。

### 14.3 Prompt 输入

```json
{
  "target": {
    "lemma": "歩く",
    "reading": "あるく",
    "partOfSpeech": "动词",
    "meaningZh": "走；步行"
  },
  "learner": {
    "level": "N5",
    "masteredVocabulary": [],
    "masteredGrammar": []
  },
  "avoidExamples": [],
  "constraints": {
    "maxJapaneseLength": 40,
    "maxNewVocabulary": 0,
    "maxNewGrammar": 0
  }
}
```

### 14.4 模型返回

使用 `vocabulary-module-design.md` 中的结构化返回，并增加：

```text
confidence
constraintWarnings
```

模型自报不能替代服务端校验，但可以辅助记录质量。

### 14.5 服务端校验

按顺序执行：

1. JSON Schema/Zod 校验。
2. 字段长度校验。
3. 目标原型或可接受活用形式检查。
4. 与已有例句完全重复检查。
5. 日文字符占比基本检查。
6. 声明的新词、新语法数量检查。
7. 保存前内容安全检查；第一版可先使用规则和供应商能力，策略需单独记录。

无法确定目标活用是否合法时，可以进行一次受限重试；不能无限重试。

### 14.6 例句状态

AI 例句状态固定为：

- `ACTIVE`
- `HIDDEN_BY_USER`
- `FLAGGED`
- `GENERATION_FAILED` 不保存为正式例句，只保存使用日志

用户隐藏例句后，学习题不再使用该例句。

### 14.7 API 幂等性

生成请求携带 `Idempotency-Key`：

- 同一 Key 成功后重复请求返回原例句。
- 网络超时后用户重试不会重复扣额度。
- 不同 Key 允许主动生成新例句。

### 14.8 完成标准

- 生成上下文只包含有限已掌握知识。
- 目标单词正确出现。
- 生成结果保存后可反复查看。
- 默认例句与 AI 例句可切换。
- 用户可隐藏、收藏和反馈。
- AI 失败不影响单词学习和默认例句。

## 15. M9：权益、额度和付费边界

### 15.1 第一版不接真实支付

先建立业务抽象：

- `FREE`：无生成额度。
- `AI_TRIAL`：有限试用额度。
- `AI_SUBSCRIBER`：按周期刷新额度。
- `INTERNAL_UNLIMITED`：内部测试。

套餐判定在服务端完成。

### 15.2 消费状态

`AiUsageRecord.status`：

- `RESERVED`
- `SUCCEEDED`
- `FAILED`
- `REVERSED`

推荐流程：

1. 检查可用额度。
2. 创建 `RESERVED` 记录。
3. 调用 AI 并校验。
4. 成功保存例句。
5. 同一事务将记录改为 `SUCCEEDED` 并增加已用额度。
6. 失败改为 `FAILED`，不增加已用额度。

第一版也可以不预占额度，但必须通过事务或锁避免并发超额。

### 15.3 权限边界

- 前端隐藏按钮不是权限控制。
- 生成接口必须验证 Session、套餐、周期和剩余额度。
- 客户端不能传入套餐、剩余额度或消费数量。
- 管理员测试权益通过 Ubuntu 环境配置或 seed 设置，不能把后门写入公开参数。

### 15.4 用户界面

显示：

- 当前可用能力。
- 本周期剩余生成次数。
- 下次刷新时间。
- 无额度时的升级说明。

没有真实支付时，升级按钮只显示说明或隐藏，不能造成已经可以在线购买的误解。

### 15.5 完成标准

- 免费用户无法绕过前端直接调用生成接口。
- 成功生成只扣一次。
- 失败和幂等重试不重复扣除。
- 并发请求不能使已用额度超过总额度。
- 使用记录可以按用户、功能和时间查询。

## 16. M10：测试与 Ubuntu 验证

### 16.1 纯逻辑单元测试

优先覆盖：

- 假名答案规范化。
- 假名错误分类。
- 分数边界。
- 掌握条件。
- 复习阶段推进和回退。
- 时区下的今日日期。
- 干扰项不重复且不包含正确答案。
- 同表记或同读音词条不会互为干扰项。
- 候选不足时切换题型或安全跳过。
- 无有效例句时不生成语境题。
- 会话重试项目延迟 3 道题且每词最多 2 次。
- AI 上下文数量限制。
- 权益额度计算。

### 16.2 数据库集成测试

覆盖：

- 作答事务。
- 重复提交幂等。
- 今日新词固定分配。
- 活动学习会话与题序恢复。
- 会话完成、放弃和跳过状态。
- 答错后重试队列持久化。
- 到期复习查询。
- 重复导入。
- 人工例句幂等导入和覆盖率报告。
- AI 例句保存和额度消费事务。
- 失败回滚。

测试使用独立 SQLite 数据库，不能污染开发或部署数据库。

### 16.3 API 测试

覆盖：

- 未登录。
- 参数缺失。
- 资源不存在。
- 空任务。
- 正确作答。
- 错误作答。
- 重复提交。
- 无 AI 配置。
- 无权益。
- 无额度。
- AI 返回非法 JSON。
- AI 请求超时。

### 16.4 页面人工验收

在 Ubuntu 启动应用后检查：

- 桌面浏览器。
- 手机浏览器。
- 中文输入法和日语 IME。
- 网络较慢时的加载状态。
- 页面刷新和返回。
- 刷新后恢复当前会话及答错重试队列。
- 连续完成一轮新词和复习。
- 生成一个 AI 例句并重复查看。

### 16.5 Ubuntu 阶段命令类型

具体命令以项目最终脚本为准，验证至少包括：

- 安装锁定依赖。
- Prisma Schema 校验。
- 数据库迁移。
- seed。
- N5 数据校验和导入。
- 单元测试。
- 集成测试。
- Lint。
- TypeScript 类型检查。
- 生产构建。
- 启动后的 HTTP 冒烟测试。
- 配置真实 AI 时的单次例句生成联调。

这些操作全部在 Ubuntu 虚拟机执行。

## 17. 分批提交建议

为了减少一次改动过大，建议按以下批次推进：

### Batch 1：数据底座

- Prisma 依赖和客户端。
- 基础 Schema。
- 默认用户 seed。
- 数据库文档同步。

### Batch 2：词汇导入

- CSV 校验器。
- 幂等导入器。
- 导入报告。
- 20 条验收样例。

### Batch 3：只读单词本

- Repository。
- 列表和详情 API。
- 单词本和详情页。

### Batch 4：学习计划

- 学习计划模型和服务。
- 今日分配。
- Dashboard API。

### Batch 5：客观题闭环

- 出题器。
- 判题与错误分类。
- 作答事务。
- 新词学习页面。

### Batch 6：复习闭环

- 复习调度。
- 错词本。
- 专项复习。
- 学习结果页。

### Batch 7：AI 例句

- 已掌握知识筛选。
- AI 生成与校验。
- 保存、切换、收藏和反馈。

### Batch 8：权益额度

- 权益模型。
- 服务端额度检查。
- 使用流水和幂等。
- 权益界面。

### Batch 9：稳定化

- 自动测试。
- 移动端调整。
- 数据和性能回归。
- 部署文档。

每个 Batch 应能独立审查。除数据库迁移等必要关联外，不要把多个里程碑塞进一次大改动。

### Batch 4.1（已实现，待 VM 验证）：计划随时调整 UI

服务层（`updatePlanById` + PATCH 路由）已就绪，本批补前端，现已落地：

- `/vocabulary/plans/[id]` 进度页新增「调整学习节奏」入口（`AdjustPace` 组件，每日量 / 结束日期二选一），仅 `ACTIVE` 计划展示。
- 实时预览以剩余未学词数为基准：「剩余 N 词 · 每天约 X 词 · 预计 Y 天完成」（`remaining = totalWords - learnedWords`）。
- 提交走 `PATCH /api/vocabulary/plans/[id]`，成功后经 `onReload` 刷新进度页；已学进度不变、`dailyNewCount` 与剩余天数由服务端按剩余词数重算。
- 校验：`endDate` 不早于今天；`dailyCount` 在 `1-500`（与新建表单及 PATCH schema 一致）；剩余为 0 时禁用保存。

VM 待验证项：类型检查 / 构建通过；调整后进度页数值正确、已学进度保留。

## 18. 风险与应对

### 18.1 数据质量不足

风险：

- 多义词、多读音和词性不规范导致判题错误。

应对：

- 保留 `VocabularyAcceptedForm`。
- 导入报告不静默忽略异常。
- 先人工审查验收样例，再扩展到全部数据。

### 18.2 “已掌握知识”仍生成陌生例句

风险：

- AI 无法严格遵守词表。

应对：

- 限制上下文和输出。
- 要求模型声明新增知识。
- 服务端校验并允许反馈。
- 对失败结果有限重试。
- 不宣传绝对不会出现陌生词，而是“尽量只使用已掌握知识”。

### 18.3 单词掌握算法过早复杂化

风险：

- 为了模拟成熟产品而拖慢第一版。

应对：

- 第一版采用离散分数和固定阶段间隔。
- 记录完整作答数据，为以后替换算法准备基础。
- 算法规则配置化，不与 UI 耦合。

### 18.4 每日任务刷新漂移

风险：

- 动态查询导致用户刷新后今日单词变化。

应对：

- 创建固定每日分配记录。
- 完成状态由服务端记录。

### 18.5 AI 重试重复扣费

风险：

- 网络超时和用户重复点击导致重复生成和重复消费。

应对：

- 使用 Idempotency Key。
- 服务端事务。
- 提交中禁用按钮。
- 成功保存后才最终计费。

### 18.6 旧统一知识点设计的迁移边界

统一规则：

- `database-design.md` 是数据模型唯一依据。
- `MasteryState` 只保留给语法和旧综合知识点。
- 单词使用 `VocabularyMastery`，客观题使用 `VocabularyQuestion` 和 `VocabularyAttempt`。
- 综合练习只有在错误能明确映射到具体单词和能力维度时，才额外更新单词记录。

## 19. MVP 完成定义

免费基础背词 MVP 完成必须同时满足：

- N1–N5 全部 8131 来源词条可幂等导入（通用脚本支持 `--all` / `--level=Nx`）。
- 人工审核例句数据可幂等导入并输出覆盖率；未覆盖词条自动降级。
- 用户可以设置每日新词数。
- 今日新词任务固定且可恢复。
- 用户可以完成新词卡和三种无例句基础题型；存在有效例句时还可以完成语境选词。
- 活动学习会话、题序和答错重试在刷新后可以恢复。
- 同表记或同读音词条不会出现在同一道选择题中。
- 读音、拼写和词义分别记录。
- 答错能分类并进入本轮重现与后续复习。
- 用户可以完成到期复习。
- 单词本、详情页和错词本可用。
- 没有 AI 配置时全部上述能力正常工作。
- Ubuntu 上测试、Lint、类型检查和生产构建通过。

付费 AI 例句 MVP 完成必须同时满足：

- 生成上下文使用当前目标词和有限的已掌握知识。
- 生成结果经过结构、目标词和重复校验。
- 结果保存后可以复用、收藏、隐藏和反馈。
- 免费用户不能调用付费接口。
- 额度只在成功生成后消费一次。
- 失败和幂等重试不扣费。
- Ubuntu 上完成至少一次真实 AI 联调。

## 20. 推荐的下一步

下一次源码实施从 Batch 1 开始：

1. 按已定稿的 `database-design.md` 编写 Prisma Schema。
2. 在 Ubuntu 虚拟机安装 Prisma、SQLite 客户端和校验依赖。
3. 同步依赖清单和锁文件。
4. 在 Windows 编写 Prisma Schema、数据库客户端和 seed 源码。
5. 同步到 Ubuntu 执行迁移与验证。

在 Batch 1 验收前，不开始编写学习页面和 AI 付费入口。

# 数据库设计

## 设计目标

第一版使用 SQLite + Prisma，服务于单用户学习闭环。数据库需要稳定支持：

- 从 N5 CSV 资料幂等导入词汇和语法。
- 统一管理词汇/语法知识点。
- 缓存 AI 生成例句，减少重复成本。
- 保存用户练习答案、AI 批改、逐知识点评估结果和原始返回。
- 维护每个知识点的掌握状态。
- 为后续多用户、PostgreSQL 和更多等级资料保留扩展空间。

## 默认决策

- 第一版固定一个本地用户：`UserProfile` 仍然建表，默认创建 `local-user`。
- 知识点 ID 使用 CUID 字符串，方便 Prisma 和未来同步。
- CSV 原始序号保留为 `sourceNo`，并用 `sourceKey` 做幂等导入。
- 掌握规则所需分数和计数放在 `MasteryState`，练习答案历史放在 `PracticeAttempt`，逐知识点判定放在 `PracticeReviewItem`。
- AI 原始 JSON 返回完整保存，方便后续排查批改质量。
- SQLite 阶段不做全文搜索表，先用普通字段过滤和 `contains` 搜索。

## 枚举

### `KnowledgeKind`

```prisma
enum KnowledgeKind {
  VOCABULARY
  GRAMMAR
}
```

### `PracticeMode`

```prisma
enum PracticeMode {
  SENTENCE_WRITING
  COMPREHENSION
}
```

`SENTENCE_WRITING` 表示主动造句输入，`COMPREHENSION` 表示理解类练习，例如阅读例句后回答含义、判断用法或选择解释。两类练习使用同一套掌握分数规则。

### `ExerciseType`

```prisma
enum ExerciseType {
  VOCAB_CONTEXT_CHOICE
  VOCAB_REPHRASE
  GRAMMAR_FILL_BLANK
  GRAMMAR_SENTENCE_ORDER
  EXAMPLE_COMPREHENSION
  SHORT_READING
  INFO_SEARCH
  SENTENCE_WRITING
}
```

`ExerciseType` 表示具体题型。第一版先覆盖文本题，听力题型后续再扩展。

### `ReviewStatus`

```prisma
enum ReviewStatus {
  CORRECT
  INCORRECT
}
```

不设置“部分正确”。AI 必须对每个受影响知识点给出 `CORRECT` 或 `INCORRECT`。

## Prisma Schema 草案

```prisma
model UserProfile {
  id          String   @id @default(cuid())
  displayName String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  masteryStates MasteryState[]
  attempts       PracticeAttempt[]

  @@map("user_profiles")
}

model KnowledgePoint {
  id             String        @id @default(cuid())
  kind           KnowledgeKind
  level          String        @default("N5")
  sourceName     String
  sourceNo       Int?
  sourceKey      String        @unique
  title          String
  reading        String?
  romaji         String?
  category       String?
  meaningZh      String?
  meaningEn      String?
  partOfSpeechZh String?
  partOfSpeechEn String?
  pattern        String?
  sourceExample  String?
  note           String?
  rawDataJson    String?
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  examples       GeneratedExample[]
  targetAttempts PracticeAttempt[]
  reviewItems    PracticeReviewItem[]
  masteryStates  MasteryState[]

  @@index([kind])
  @@index([level])
  @@index([category])
  @@index([title])
  @@map("knowledge_points")
}

model GeneratedExample {
  id               String         @id @default(cuid())
  knowledgePointId String
  japanese         String
  chinese          String
  difficulty       String         @default("N5")
  model            String
  promptVersion    String
  rawAiResponse    String?
  createdAt        DateTime       @default(now())

  knowledgePoint   KnowledgePoint @relation(fields: [knowledgePointId], references: [id], onDelete: Cascade)

  @@index([knowledgePointId])
  @@index([createdAt])
  @@map("generated_examples")
}

model PracticeAttempt {
  id               String         @id @default(cuid())
  userId           String
  targetKnowledgePointId String
  mode             PracticeMode   @default(SENTENCE_WRITING)
  exerciseType     ExerciseType
  promptText       String?
  userAnswer       String
  summaryZh        String
  correctedSentence String?
  naturalSentence   String?
  model             String
  promptVersion     String
  rawAiResponse     String?
  createdAt         DateTime      @default(now())

  user             UserProfile    @relation(fields: [userId], references: [id], onDelete: Cascade)
  targetKnowledgePoint KnowledgePoint @relation(fields: [targetKnowledgePointId], references: [id], onDelete: Cascade)
  reviewItems      PracticeReviewItem[]

  @@index([userId, createdAt])
  @@index([targetKnowledgePointId, createdAt])
  @@index([userId, targetKnowledgePointId, createdAt])
  @@map("practice_attempts")
}

model PracticeReviewItem {
  id               String         @id @default(cuid())
  attemptId        String
  knowledgePointId String
  status           ReviewStatus
  scoreDelta       Int
  beforeScore      Int
  afterScore       Int
  noteZh           String
  evidence         String?
  createdAt        DateTime       @default(now())

  attempt          PracticeAttempt @relation(fields: [attemptId], references: [id], onDelete: Cascade)
  knowledgePoint   KnowledgePoint  @relation(fields: [knowledgePointId], references: [id], onDelete: Cascade)

  @@unique([attemptId, knowledgePointId])
  @@index([knowledgePointId, createdAt])
  @@index([status])
  @@map("practice_review_items")
}

model MasteryState {
  id               String         @id @default(cuid())
  userId           String
  knowledgePointId String
  masteryScore     Int            @default(0)
  correctCount     Int            @default(0)
  wrongCount       Int            @default(0)
  isMastered       Boolean        @default(false)
  lastPracticedAt  DateTime?
  masteredAt       DateTime?
  createdAt        DateTime       @default(now())
  updatedAt        DateTime       @updatedAt

  user             UserProfile    @relation(fields: [userId], references: [id], onDelete: Cascade)
  knowledgePoint   KnowledgePoint @relation(fields: [knowledgePointId], references: [id], onDelete: Cascade)

  @@unique([userId, knowledgePointId])
  @@index([userId, isMastered])
  @@index([userId, masteryScore])
  @@index([userId, lastPracticedAt])
  @@map("mastery_states")
}
```

## 字段说明

### `UserProfile`

第一版虽然是单用户，也保留用户表。这样后续做多用户时不用重写练习记录和掌握状态结构。

默认 seed：

```text
id: local-user
displayName: Local Learner
```

实现时建议手动指定固定 ID，而不是让默认 CUID 生成。

### `KnowledgePoint`

统一保存词汇和语法。

- `sourceName`：资料来源，例如 `jlpt_n5_core_vocabulary`、`jlpt_n5_grammar_outline`。
- `sourceNo`：CSV 中的序号。
- `sourceKey`：幂等导入用唯一键，建议格式为 `sourceName:sourceNo`；没有序号时用稳定 hash。
- `level`：第一版默认 `N5`，后续可加 N4/N3。
- `rawDataJson`：保留导入行原始数据，方便后续重新映射或排查资料问题。

词汇映射：

| CSV 字段 | 数据库字段 |
| --- | --- |
| `no` | `sourceNo` |
| `word` | `title` |
| `kana` | `reading` |
| `romaji` | `romaji` |
| `type_zh` | `partOfSpeechZh` |
| `zh` | `meaningZh` |
| `english` | `meaningEn` |
| `type` | `partOfSpeechEn` |

语法映射：

| CSV 字段 | 数据库字段 |
| --- | --- |
| `No` | `sourceNo` |
| `Category` | `category` |
| `Grammar` | `title` |
| `Reading` | `reading` |
| `Pattern` | `pattern` |
| `Meaning` | `meaningZh` |
| `Example` | `sourceExample` |
| `Note` | `note` |

### `GeneratedExample`

保存 AI 生成的例句缓存。

- 一个知识点可以有多条例句。
- `promptVersion` 用来标记 prompt 版本，例如 `examples-v1`。
- `rawAiResponse` 保存完整模型返回，便于质量排查。
- 第一版不限制同一知识点只能生成一批；界面默认优先显示最新或最早一批都可以，建议优先显示最新 5 条。

### `PracticeAttempt`

保存一次用户练习提交和 AI 原始批改结果。

- `targetKnowledgePointId` 是出题时要求用户练习的目标知识点。
- `mode` 区分造句输入和理解类练习。
- `exerciseType` 记录具体题型，用于统计哪类题暴露问题最多。
- `promptText` 保存理解题题干、例句或材料；造句练习可为空。
- `userAnswer` 保存用户答案。造句模式下它就是用户写的日语句子；理解模式下它可以是中文解释、选择项或判断结果。
- `summaryZh` 面向用户展示本次输入整体反馈。
- `correctedSentence` 保存修正后的句子。
- `naturalSentence` 保存更自然的表达。
- `rawAiResponse` 保存 AI JSON 原文。

### `PracticeReviewItem`

保存一次练习中每个受影响知识点的判定结果。

- 每条记录只对应一个知识点。
- `status` 只有 `CORRECT` 或 `INCORRECT`。
- `scoreDelta` 保存本次对该知识点的规则分数变化：正确为 `+20`，错误为 `-10`。
- `beforeScore` 和 `afterScore` 保存应用分数变化前后的分数，便于审计和复盘。
- `afterScore` 必须按 `0` 到 `100` 夹紧；例如 `beforeScore=95` 且正确时，`scoreDelta=20`，`afterScore=100`。
- `noteZh` 说明为什么该知识点加分或扣分。
- `evidence` 保存句子中的相关片段，例如拼错的词或出错的语法结构。

示例：

- 用户练习语法「は」，句子里词汇拼写错但「は」用对：语法「は」对应 `CORRECT +20`，拼错词汇对应 `INCORRECT -10`。
- 用户词汇拼写正确但漏掉「は」：词汇对应 `CORRECT +20`，语法「は」对应 `INCORRECT -10`。
- 用户做理解题并正确理解目标词汇或语法：对应知识点 `CORRECT +20`。
- 用户做理解题但理解错误：对应知识点 `INCORRECT -10`。

### `MasteryState`

保存某个用户对某个知识点的当前掌握状态。

- `masteryScore`：当前掌握分数，范围 `0` 到 `100`。
- `correctCount`：累计正确练习次数。
- `wrongCount`：累计错误练习次数。
- `isMastered`：是否已掌握。
- `masteredAt`：首次达到 100 分的时间。

默认掌握规则：

- `CORRECT`：`correctCount + 1`，`masteryScore + 20`。
- `INCORRECT`：`wrongCount + 1`，`masteryScore - 10`。
- `masteryScore` 最低为 `0`，最高为 `100`。
- `masteryScore >= 100` 时设置 `isMastered = true`。
- AI 调用失败、JSON 解析失败、请求校验失败不创建 `PracticeAttempt`，也不更新 `MasteryState`。

## 导入策略

导入脚本目标：

- 重复运行不会产生重复知识点。
- 新资料可以更新已有知识点字段。
- 每个知识点都有一个 `MasteryState`。

建议流程：

1. 确保 `UserProfile(local-user)` 存在。
2. 读取词汇 CSV，转换为 `KnowledgePoint` 输入。
3. 读取语法 CSV，转换为 `KnowledgePoint` 输入。
4. 对每条数据按 `sourceKey` 执行 upsert。
5. 对每个知识点和 `local-user` 执行 `MasteryState` upsert。
6. 输出导入统计：新增、更新、跳过、错误。

建议来源名：

```text
jlpt_n5_core_vocabulary
jlpt_n5_grammar_outline
```

建议 `sourceKey`：

```text
jlpt_n5_core_vocabulary:1
jlpt_n5_grammar_outline:1
```

## 查询与索引

常见查询：

- 首页统计：按 `userId` 聚合 `MasteryState`。
- 知识点列表：按 `kind`、`category`、`isMastered`、关键词过滤。
- 下一题：优先查询 `isMastered = false`，再按 `masteryScore` 升序、`lastPracticedAt` 升序或空值优先。
- 详情页：按 `KnowledgePoint.id` 查询，包含例句、掌握状态、最近练习。
- 历史记录：按 `userId + targetKnowledgePointId + createdAt desc` 查询，再加载 `PracticeReviewItem` 明细。

索引优先覆盖：

- `KnowledgePoint.kind`
- `KnowledgePoint.category`
- `KnowledgePoint.title`
- `MasteryState.userId + isMastered`
- `MasteryState.userId + masteryScore`
- `MasteryState.userId + lastPracticedAt`
- `PracticeAttempt.userId + createdAt`
- `PracticeAttempt.targetKnowledgePointId + createdAt`
- `PracticeReviewItem.knowledgePointId + createdAt`

## 待确认决策

### 1. 已掌握后是否继续计数

建议默认：继续记录所有练习和计数，但不自动取消已掌握；分数保持在 `0` 到 `100` 范围内。

原因：这样历史完整，用户复习时仍能看到长期表现。

### 2. 例句缓存是否允许重复生成多批

建议默认：允许重复生成多批，展示最新 5 条，后续可做“收藏/隐藏”。

原因：不同批次例句有助于阅读量，不会破坏主流程；成本也由 DeepSeek 低价模型控制。

### 3. 是否保存 AI 原始返回

建议默认：保存。

原因：这是排查批改质量、prompt 演进和数据回溯的关键材料。第一版单用户，隐私风险可控。

### 4. 是否现在引入 `StudySession`

建议默认：不引入。

原因：第一版可以通过 `PracticeAttempt.createdAt` 统计今日练习；等需要“每次学习会话报告”时再加。

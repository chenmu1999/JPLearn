# 数据库设计

## 设计目标

第一版使用 SQLite + Prisma，服务于单用户学习闭环。数据库需要稳定支持：

- 从 N5 CSV 资料幂等导入词汇和语法。
- 统一管理词汇/语法知识点。
- 缓存 AI 生成例句，减少重复成本。
- 保存用户造句、AI 批改和原始返回。
- 维护每个知识点的掌握状态。
- 为后续多用户、PostgreSQL 和更多等级资料保留扩展空间。

## 默认决策

- 第一版固定一个本地用户：`UserProfile` 仍然建表，默认创建 `local-user`。
- 知识点 ID 使用 CUID 字符串，方便 Prisma 和未来同步。
- CSV 原始序号保留为 `sourceNo`，并用 `sourceKey` 做幂等导入。
- 掌握规则所需计数放在 `MasteryState`，练习历史放在 `PracticeAttempt`。
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
}
```

第一版只做造句练习，但提前留出模式字段。

### `ReviewStatus`

```prisma
enum ReviewStatus {
  CORRECT
  PARTIAL
  INCORRECT
}
```

建议默认：`score >= 0.75` 记为 `CORRECT`，`0.4 <= score < 0.75` 记为 `PARTIAL`，低于 `0.4` 记为 `INCORRECT`。

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
  attempts       PracticeAttempt[]
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
  knowledgePointId String
  mode             PracticeMode   @default(SENTENCE_WRITING)
  userSentence     String
  status           ReviewStatus
  isCorrect        Boolean
  score            Float
  feedbackZh       String
  correctedSentence String?
  naturalSentence   String?
  targetUsageNote   String?
  otherErrorsNote   String?
  model             String
  promptVersion     String
  rawAiResponse     String?
  createdAt         DateTime      @default(now())

  user             UserProfile    @relation(fields: [userId], references: [id], onDelete: Cascade)
  knowledgePoint   KnowledgePoint @relation(fields: [knowledgePointId], references: [id], onDelete: Cascade)

  @@index([userId, createdAt])
  @@index([knowledgePointId, createdAt])
  @@index([userId, knowledgePointId, createdAt])
  @@index([status])
  @@map("practice_attempts")
}

model MasteryState {
  id               String         @id @default(cuid())
  userId           String
  knowledgePointId String
  correctCount     Int            @default(0)
  partialCount     Int            @default(0)
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

保存一次用户造句和 AI 批改结果。

- `status` 保存三档结果：正确、部分正确、错误。
- `isCorrect` 是掌握度规则的快捷布尔值，只在 `status = CORRECT` 时为 true。
- `feedbackZh` 面向用户展示。
- `targetUsageNote` 说明目标知识点是否用对。
- `otherErrorsNote` 保存非目标知识点的明显错误，避免影响主要判断。
- `rawAiResponse` 保存 AI JSON 原文。

### `MasteryState`

保存某个用户对某个知识点的当前掌握状态。

- `correctCount`：累计正确次数。
- `partialCount`：累计部分正确次数。
- `wrongCount`：累计错误次数。
- `isMastered`：是否已掌握。
- `masteredAt`：首次达到掌握阈值的时间。

默认掌握规则：

- `CORRECT`：`correctCount + 1`。
- `PARTIAL`：`partialCount + 1`。
- `INCORRECT`：`wrongCount + 1`。
- `correctCount >= 3` 时设置 `isMastered = true`。
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
- 下一题：优先查询 `isMastered = false`，再按 `lastPracticedAt` 升序或空值优先。
- 详情页：按 `KnowledgePoint.id` 查询，包含例句、掌握状态、最近练习。
- 历史记录：按 `userId + knowledgePointId + createdAt desc` 查询。

索引优先覆盖：

- `KnowledgePoint.kind`
- `KnowledgePoint.category`
- `KnowledgePoint.title`
- `MasteryState.userId + isMastered`
- `MasteryState.userId + lastPracticedAt`
- `PracticeAttempt.userId + createdAt`
- `PracticeAttempt.knowledgePointId + createdAt`

## 待确认决策

### 1. 部分正确是否增加掌握进度

建议默认：不增加 `correctCount`，只增加 `partialCount`。

原因：N5 造句训练的目标是“能正确使用”，部分正确适合鼓励和复盘，但不应推动掌握完成。

### 2. 已掌握后是否继续计数

建议默认：继续记录所有练习和计数，但不自动取消已掌握。

原因：这样历史完整，用户复习时仍能看到长期表现。

### 3. 例句缓存是否允许重复生成多批

建议默认：允许重复生成多批，展示最新 5 条，后续可做“收藏/隐藏”。

原因：不同批次例句有助于阅读量，不会破坏主流程；成本也由 DeepSeek 低价模型控制。

### 4. 是否保存 AI 原始返回

建议默认：保存。

原因：这是排查批改质量、prompt 演进和数据回溯的关键材料。第一版单用户，隐私风险可控。

### 5. 是否现在引入 `StudySession`

建议默认：不引入。

原因：第一版可以通过 `PracticeAttempt.createdAt` 统计今日练习；等需要“每次学习会话报告”时再加。

# 数据库设计（定稿）

## 1. 文档地位

本文是 JPLearn 第一版数据结构的唯一实现依据。若其他旧文档仍把词汇直接存入 `KnowledgePoint`，或让词汇使用统一的 `MasteryState +20/-10` 模型，以本文和 `vocabulary-module-execution-plan.md` 为准。

第一版使用 SQLite + Prisma。数据库时间统一存储为 UTC；“今日”按用户学习计划中的时区计算，默认 `Asia/Shanghai`。

## 2. 已锁定的数据决策

### 2.1 词汇来源

- 导入源固定为仓库内的 `data/vocabulary/jlpt/jlpt-vocabulary.csv`。
- 第一版启用其中 `level=N5` 的 718 条来源词条。
- `n1.csv` 至 `n5.csv` 只用于来源追溯，不直接导入应用数据库。
- `id`（如 `jlpt-n5-0002`）作为稳定的 `sourceKey`。
- `source_guid` 和整行原始内容保留，方便以后对照上游数据。
- 不再以 Windows 工作区外的旧词汇 CSV 作为第一版权威来源。

### 2.2 词条和义项

- 一行统一 CSV 对应一个 `VocabularyEntry`，也就是一个可独立学习、复习和统计的来源词条。
- 同形同音但来源义项不同的多行数据，第一版保持为不同词条，不自动合并。
- 跨等级重复词条同样保留；学习计划按等级选择对应来源词条。
- 一个词条内部允许多个中文义项，使用 `VocabularySense` 表示。
- 多个合法读音或表记使用 `VocabularyAcceptedForm` 表示。
- 后续如果人工确认多个来源词条应合并，必须通过显式的数据清洗映射完成，不能依靠字符串自动去重。

### 2.3 通用索引与专用模型

- `KnowledgePoint` 是词汇和语法的跨模块索引，不承载单词学习细节。
- 每个 `VocabularyEntry` 必须一对一关联一个 `KnowledgePoint(kind=VOCABULARY)`。
- 语法继续使用通用 `MasteryState` 和综合练习记录。
- 单词只使用 `VocabularyMastery`、`VocabularyAttempt` 和复习调度，不写入通用 `MasteryState`。
- 综合练习若明确暴露单词错误，可以额外写入 `VocabularyAttempt`；不能通过通用分数直接修改单词掌握状态。

### 2.4 用户状态

- 单词状态为 `NEW`、`LEARNING`、`REVIEWING`、`MASTERED`。
- 暂停和收藏是用户属性，分别使用 `isSuspended`、`isFavorite`，不混入学习状态枚举。
- 错词本由 `VocabularyAttempt` 的错误记录派生，不维护容易失真的独立错词布尔值。
- 单词收藏保存在 `VocabularyMastery.isFavorite`。
- 例句收藏、隐藏保存在用户与例句的关联表中，不能放在公共 `VocabularyExample` 上。

### 2.5 每日任务和题目安全

- `VocabularyDailyAssignment` 是第一版必需模型，不是可选优化。
- 同一用户、日期、词条和任务类型只能分配一次，保证刷新后任务稳定。
- `VocabularyStudySession` 和 `VocabularySessionItem` 是第一版必需模型，负责持久化一轮学习的顺序、重试和完成状态。
- `VocabularyQuestion` 保存服务端生成的短期题目实例。
- 客户端只拿到题干和选项，不拿到标准答案。
- `VocabularyAttempt.questionId` 唯一，保证同一道题不能重复加分。

### 2.6 例句与选择题降级

- 第一版准备并导入独立的人工审核 `CURATED` 例句数据，目标覆盖全部 718 条 N5 来源词条。
- 词条没有有效 `SOURCE` 或 `CURATED` 例句时，学习卡仍正常展示，出题器跳过 `CONTEXT_WORD_CHOICE`。
- 已保存且未隐藏的 AI 例句可以用于语境题，但基础流程不能为了出题实时调用 AI。
- 选择题干扰项必须排除与目标词任一合法表记相同或任一合法读音相同的词条；该限制不能因候选不足而放宽。
- 严格排除后不足 3 个干扰项时，改用其他可用题型，不生成低质量或有歧义的四选一题。

## 3. 模型分组

### 3.1 用户与通用知识

#### `UserProfile`

```text
id
displayName
timezone
createdAt
updatedAt
```

第一版 seed 固定创建：

```text
id: local-user
displayName: Local Learner
timezone: Asia/Shanghai
```

#### `KnowledgePoint`

```text
id
kind                  // VOCABULARY, GRAMMAR
level
sourceName
sourceKey
title
createdAt
updatedAt
```

约束：

- `sourceKey` 全局唯一。
- 词汇只在这里保存跨模块检索所需的标题、等级和来源标识。
- 语法的读法、接续、释义、例句等专有字段在后续语法专用模型落地前可以暂存于 `KnowledgePoint` 的可选字段中。

#### `MasteryState`

只服务语法及旧综合知识点：

```text
id
userId
knowledgePointId
masteryScore
correctCount
wrongCount
isMastered
lastPracticedAt
masteredAt
createdAt
updatedAt
```

唯一约束：`(userId, knowledgePointId)`。

## 4. 单词基础数据

### 4.1 `VocabularyEntry`

一条来源词汇学习单元：

```text
id
knowledgePointId
sourceKey
sourceGuid
level
lemma
primaryWriting
primaryReading
partOfSpeech
category
meaningEn
usageNoteZh
rawDataJson
isActive
sourceOrder
createdAt
updatedAt
```

约束：

- `knowledgePointId` 唯一。
- `sourceKey` 唯一。
- `(level, sourceOrder)` 唯一。
- `isActive=false` 只表示来源词条停用，不删除用户历史。

当前 CSV 映射：

| CSV 字段 | 目标字段 |
| --- | --- |
| `id` | `sourceKey` |
| `level` | `level` |
| `expression` | `lemma`、`primaryWriting` |
| `reading` | `primaryReading` |
| `meaning_en` | `meaningEn` |
| `meaning_zh` | 生成主要 `VocabularySense` |
| `tags` | 保存在 `rawDataJson`，后续清洗后再映射分类 |
| `source_guid` | `sourceGuid` |
| `source` | `KnowledgePoint.sourceName` |

当前数据没有可靠、结构化的词性、分类和例句，因此这些字段允许为空，不能根据英文释义静默猜测后写入正式字段。

### 4.2 `VocabularySense`

保存中文义项：

```text
id
vocabularyId
meaningZh
order
isPrimary
noteZh
createdAt
updatedAt
```

约束：

- `(vocabularyId, order)` 唯一。
- 每个词条必须且只能有一个 `isPrimary=true` 的义项。
- 第一版导入时将 `meaning_zh` 作为一个主要义项整体保存；只有经过可靠分词或人工审核后才拆成多个义项。

### 4.3 `VocabularyAcceptedForm`

保存额外合法读音和表记：

```text
id
vocabularyId
formType             // READING, WRITING
value
isPrimary
noteZh
createdAt
updatedAt
```

约束：

- `(vocabularyId, formType, value)` 唯一。
- 主读音和主表记也各写入一条 accepted form，便于判题统一查询。
- 中文义项不放入该表，由 `VocabularySense` 管理。

### 4.4 `VocabularyExample`

公共例句内容：

```text
id
vocabularyId
sourceType           // SOURCE, CURATED, AI
status               // ACTIVE, FLAGGED
japanese
chinese
targetSurface
usageNoteZh
difficulty
isDefault
model
promptVersion
generationContextJson
introducedKnowledgeJson
rawAiResponse
createdByUserId
createdAt
updatedAt
```

约束：

- 每个词条最多一个有效默认例句。
- `SOURCE`、`CURATED` 例句不要求 AI 字段。
- `AI` 例句必须记录模型、prompt 版本和生成上下文摘要。
- `VocabularyExample` 不包含 `isFavorite` 或用户级隐藏状态。

### 4.5 `VocabularyExampleUserState`

用户对例句的状态：

```text
id
userId
exampleId
isFavorite
isHidden
createdAt
updatedAt
```

唯一约束：`(userId, exampleId)`。

### 4.6 `VocabularyExampleFeedback`

```text
id
userId
exampleId
feedbackType         // UNNATURAL, TOO_DIFFICULT, UNKNOWN_CONTENT, OTHER
comment
createdAt
```

反馈是追加记录，不覆盖历史。

## 5. 单词学习数据

### 5.1 `VocabularyMastery`

用户对一个词条的当前汇总状态：

```text
id
userId
vocabularyId
status
readingScore
spellingScore
meaningScore
writingScore
contextScore
reviewStage
nextReviewAt
lastReviewedAt
lastInputCorrectAt
lastInputWrongAt
consecutiveCorrectCount
consecutiveWrongCount
masteredAt
isFavorite
isSuspended
createdAt
updatedAt
```

约束：

- `(userId, vocabularyId)` 唯一。
- 所有分数限制为 `0-100`。
- `reviewStage` 限制为 `0-5`。
- `isSuspended=true` 时不进入自动学习和复习队列。
- 导入词条时不批量创建所有用户掌握记录；用户首次查询、分配或操作词条时按需 upsert，避免未来多用户数据膨胀。

第一版掌握条件：

- `readingScore >= 80`
- `spellingScore >= 80`
- `meaningScore >= 80`
- 最近一次主动输入题正确，即 `lastInputCorrectAt` 不为空，且 `lastInputWrongAt` 为空或 `lastInputCorrectAt > lastInputWrongAt`

### 5.2 `VocabularyStudyPlan`

```text
id
userId
level
dailyNewCount
timezone
isActive
startedAt
targetCompletedAt
createdAt
updatedAt
```

约束：

- 第一版一个用户只能有一个启用中的词汇计划。SQLite/Prisma 不依赖部分唯一索引，由创建或启用计划的服务事务检查并关闭旧计划。
- `dailyNewCount` 范围为 `5-50`，默认 `10`。
- 第一版 `level=N5`。

### 5.3 `VocabularyDailyAssignment`

```text
id
userId
localDate
vocabularyId
assignmentType       // NEW, REVIEW
order
completedAt
createdAt
updatedAt
```

约束：

- `(userId, localDate, vocabularyId, assignmentType)` 唯一。
- `(userId, localDate, assignmentType, order)` 唯一。
- `localDate` 使用 `YYYY-MM-DD` 字符串，按学习计划时区生成。
- NEW 分配创建后固定；修改每日新词数只追加或减少尚未开始的当日分配，不能更换已经开始的词条。
- REVIEW 可以按到期状态动态补入，但一旦写入当日分配也保持稳定。

### 5.4 `VocabularyStudySession`

保存一轮可恢复的学习或复习：

```text
id
userId
sessionType          // LEARN, REVIEW, WRONG_BOOK
localDate
status               // ACTIVE, COMPLETED, ABANDONED
completedItemCount
startedAt
lastActivityAt
completedAt
createdAt
updatedAt
```

约束：

- 同一用户同一 `sessionType` 最多一个 `ACTIVE` 会话，由服务事务保证。
- 页面刷新或重新进入时优先恢复现有 `ACTIVE` 会话。
- 用户主动结束未完成会话时标记 `ABANDONED`，不删除会话项目和已完成作答。

### 5.5 `VocabularySessionItem`

一条记录代表会话中一次计划出题；答错重现会创建新的重试项目：

```text
id
sessionId
vocabularyId
assignmentId
sourceItemId
sequence
attemptNo
availableAfterCompletedCount
exerciseType
targetDimension
status               // PENDING, ISSUED, CORRECT, INCORRECT, SKIPPED
questionId
createdAt
updatedAt
```

约束：

- `(sessionId, sequence)` 唯一。
- 初始项目 `attemptNo=0`；答错后最多创建 `attemptNo=1`、`attemptNo=2` 两个重试项目。
- 重试项目通过 `sourceItemId` 关联首次项目。
- 答错重试设置为完成另外 3 道题后可用；剩余题目不足时排到本轮末尾。
- 当前题、重试次数和队列顺序全部由服务端会话项目恢复，不能只保存在 React 状态中。

### 5.6 `VocabularyQuestion`

```text
id
userId
vocabularyId
assignmentId
sessionItemId
exerciseType
targetDimension
promptJson
optionsJson
acceptedAnswersJson
status               // ISSUED, ANSWERED, EXPIRED
issuedAt
expiresAt
answeredAt
createdAt
```

说明：

- `acceptedAnswersJson` 只供服务端读取，不返回答题前客户端。
- 第一版使用数据库题目实例，不采用客户端可解码的签名答案载荷。
- 一个题目过期后不能提交。

### 5.7 `VocabularyAttempt`

```text
id
questionId
userId
vocabularyId
assignmentId
sessionId
sessionItemId
source               // LEARN, REVIEW, WRONG_BOOK, COMPREHENSIVE
exerciseType
targetDimension
promptSnapshotJson
userAnswer
acceptedAnswer
isCorrect
usedHint
responseTimeMs
errorType
scoreBefore
scoreAfter
reviewStageBefore
reviewStageAfter
nextReviewAtAfter
createdAt
```

约束：

- `questionId` 唯一。
- 保存作答、更新 `VocabularyMastery`、题目状态、会话项目、重试队列和每日任务必须在同一事务中完成。
- `responseTimeMs` 只用于统计，不作为可信安全数据。
- 客户端不能提交 `isCorrect`、错误类型、分数变化或下次复习时间。

## 6. 通用练习与单词练习边界

通用模型保留：

```text
PracticeAttempt
PracticeReviewItem
MasteryState
```

它们服务语法、阅读理解和开放式 AI 批改。单词客观题不写入这些表。

开放式造句同时涉及语法和词汇时：

1. AI 整体批改结果保存到通用 `PracticeAttempt`。
2. 语法判断写入 `PracticeReviewItem` 并更新 `MasteryState`。
3. 只有能够明确映射到具体单词和错误维度时，才额外创建来源为 `COMPREHENSIVE` 的 `VocabularyQuestion` 与 `VocabularyAttempt`。
4. 不确定的词汇判断只展示反馈，不修改 `VocabularyMastery`。

## 7. AI 权益

### `AiEntitlement`

```text
id
userId
planCode
quotaTotal
quotaUsed
periodStartedAt
periodEndsAt
createdAt
updatedAt
```

### `AiUsageRecord`

```text
id
userId
featureType
targetId
idempotencyKey
status               // RESERVED, SUCCEEDED, FAILED, REVERSED
quotaDelta
model
estimatedInputTokens
estimatedOutputTokens
createdAt
updatedAt
```

约束：

- `(userId, featureType, idempotencyKey)` 唯一。
- 只有例句成功保存后才把使用记录改为 `SUCCEEDED` 并消费额度。

## 8. 删除与更新策略

- 用户、词条和知识点默认不物理删除。
- 来源词条消失时标记 `VocabularyEntry.isActive=false` 并输出导入报告。
- 已有学习记录的词条不得级联物理删除。
- 题目、作答、额度流水和反馈属于审计记录，不允许普通业务接口修改。
- 用户重置单词只重置 `VocabularyMastery` 当前状态；默认保留历史作答，另记重置操作日志可在后续加入。

## 9. 导入流程

1. 幂等创建 `local-user`。
2. 读取统一 CSV，并筛选 `level=N5`。
3. 校验稳定 ID、读音、中文释义和来源顺序。
4. 按 CSV `id` upsert `KnowledgePoint`。
5. upsert `VocabularyEntry`。
6. upsert 主读音、主表记和主要义项。
7. 不创建默认例句，不伪造词性和分类。
8. 不预创建 718 条 `VocabularyMastery`。
9. 输出新增、更新、停用、异常和重复报告。

验收基线：

- N5 活跃来源词条为 718 条。
- 重复导入不增加记录数。
- 同形同音不同来源义项保持独立。
- 缺失读音或中文释义的行报告为阻断错误。

查询没有对应 `VocabularyMastery` 的词条时，业务层统一视为默认 `NEW`、五项分数为 `0`，不能要求导入阶段预生成用户状态。

人工例句使用独立受控数据文件导入为 `VocabularyExample(sourceType=CURATED)`。导入器必须按 `sourceKey` 关联词条、校验目标词或合法活用形式确实出现在例句中，并输出覆盖率与异常报告。

## 10. 关键索引

- `KnowledgePoint.sourceKey`
- `VocabularyEntry.sourceKey`
- `VocabularyEntry(level, sourceOrder)`
- `VocabularyEntry(primaryWriting)`
- `VocabularyEntry(primaryReading)`
- `VocabularySense(meaningZh)`
- `VocabularyMastery(userId, status, isSuspended)`
- `VocabularyMastery(userId, nextReviewAt, isSuspended)`
- `VocabularyDailyAssignment(userId, localDate, assignmentType, order)`
- `VocabularyStudySession(userId, status, sessionType)`
- `VocabularySessionItem(sessionId, status, sequence)`
- `VocabularySessionItem(sessionId, availableAfterCompletedCount, sequence)`
- `VocabularyQuestion(userId, status, expiresAt)`
- `VocabularyAttempt(userId, vocabularyId, createdAt)`
- `VocabularyAttempt(userId, errorType, createdAt)`
- `VocabularyExample(vocabularyId, isDefault, status)`

SQLite 第一版使用普通索引和 `contains` 搜索，不建立全文搜索表。后续切换 PostgreSQL 时再评估全文索引。

## 11. 第一批实现范围

Batch 1 必须建立：

- `UserProfile`
- `KnowledgePoint`
- `MasteryState`
- `VocabularyEntry`
- `VocabularySense`
- `VocabularyAcceptedForm`
- `VocabularyExample`
- `VocabularyMastery`
- `VocabularyStudyPlan`
- `VocabularyDailyAssignment`
- `VocabularyStudySession`
- `VocabularySessionItem`
- `VocabularyQuestion`
- `VocabularyAttempt`

AI 权益、例句用户状态和反馈可以在对应功能批次增加，但字段和关系按本文执行，不再重新设计。

人工审核例句数据文件和导入器属于免费基础背词 MVP；即使覆盖尚未达到 100%，缺失词条的自动降级行为也必须同步实现。

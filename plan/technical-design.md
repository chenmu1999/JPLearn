# 技术设计文档

## 开发与运行环境约束

- Windows 本机工作区只用于查看、书写和修改源码及项目文档。
- Windows 本机不得安装项目依赖，也不得执行编译、构建、类型检查、Lint、测试、数据库操作、AI API 实际调用、服务启动、容器构建或部署。
- 所有运行时操作必须在 Ubuntu 虚拟机完成，包括依赖安装、构建验证、数据库迁移、DeepSeek API 联调和 ngrok 部署。
- Windows 完成源码修改后，应先同步到 Ubuntu 虚拟机，再进行任何技术验证。

## 技术栈

- Runtime：Node.js LTS。
- Web 框架：Next.js App Router。
- 语言：TypeScript。
- 样式：Tailwind CSS。
- 数据库：SQLite。
- ORM：Prisma。
- AI SDK：优先使用 OpenAI 官方 SDK，配置为 OpenAI 兼容接口；第一版模型暂定 DeepSeek v4 flash。
- 部署：Docker + Docker Compose。
- 目标 Linux：Ubuntu Server 22.04 LTS 或 24.04 LTS。

## 目录结构

计划初始化后的主要结构：

```text
app/
  page.tsx
  practice/page.tsx
  knowledge/page.tsx
  knowledge/[id]/page.tsx
  settings/page.tsx
  api/
    examples/route.ts
    attempts/route.ts
components/
lib/
  ai/
  db/
  import/
  mastery/
prisma/
  schema.prisma
  seed.ts
scripts/
  import-n5-data.ts
data/
  imported/
plan/
```

## 数据模型

详细 Prisma schema 草案、字段约束、索引和导入幂等策略见 `database-design.md`。本节只保留核心模型摘要。

### KnowledgePoint

统一表示词汇和语法。

关键字段：
- `id`
- `kind`：`VOCABULARY` 或 `GRAMMAR`
- `sourceNo`
- `title`
- `reading`
- `romaji`
- `category`
- `meaningZh`
- `meaningEn`
- `partOfSpeechZh`
- `partOfSpeechEn`
- `pattern`
- `sourceExample`
- `note`
- `createdAt`
- `updatedAt`

词汇字段映射：
- `word -> title`
- `kana -> reading`
- `romaji -> romaji`
- `type_zh -> partOfSpeechZh`
- `zh -> meaningZh`
- `english -> meaningEn`
- `type -> partOfSpeechEn`

语法字段映射：
- `Grammar -> title`
- `Reading -> reading`
- `Category -> category`
- `Pattern -> pattern`
- `Meaning -> meaningZh`
- `Example -> sourceExample`
- `Note -> note`

### GeneratedExample

缓存 AI 生成例句。

关键字段：
- `id`
- `knowledgePointId`
- `japanese`
- `chinese`
- `difficulty`
- `model`
- `createdAt`

### PracticeAttempt

保存一次用户练习提交。

关键字段：
- `id`
- `targetKnowledgePointId`
- `mode`
- `exerciseType`
- `promptText`
- `userAnswer`
- `correctedSentence`
- `summaryZh`
- `model`
- `rawAiResponse`
- `createdAt`

### PracticeReviewItem

保存一次练习中每个受影响知识点的判定结果。

关键字段：
- `id`
- `attemptId`
- `knowledgePointId`
- `status`：`CORRECT` 或 `INCORRECT`
- `scoreDelta`：正确为 `+20`，错误为 `-10`
- `beforeScore`
- `afterScore`
- `noteZh`
- `evidence`
- `createdAt`

### MasteryState

保存掌握度。

关键字段：
- `id`
- `knowledgePointId`
- `masteryScore`
- `correctCount`
- `wrongCount`
- `isMastered`
- `lastPracticedAt`
- `masteredAt`

## API 设计

### `GET /api/knowledge`

查询知识点列表。

查询参数：
- `kind`
- `mastered`
- `category`
- `q`

返回知识点摘要和掌握状态。

### `GET /api/knowledge/:id`

查询单个知识点详情、AI 例句和练习记录。

### `POST /api/examples`

为知识点生成例句。

请求：

```json
{
  "knowledgePointId": "string"
}
```

行为：
- 如果已有缓存例句，优先返回缓存。
- 如果没有缓存，调用 AI 生成 5 条 N5 难度例句并保存。

### `POST /api/attempts`

提交用户练习答案并批改。

请求：

```json
{
  "targetKnowledgePointId": "string",
  "mode": "SENTENCE_WRITING",
  "exerciseType": "SENTENCE_WRITING",
  "promptText": "optional prompt text",
  "answer": "日本語の文"
}
```

返回：

```json
{
  "summaryZh": "目标知识点理解或使用正确，但有一个词汇拼写错误。",
  "correctedSentence": "...",
  "reviewItems": [
    {
      "knowledgePointId": "grammar-id",
      "status": "CORRECT",
      "scoreDelta": 20,
      "beforeScore": 40,
      "afterScore": 60,
      "noteZh": "目标语法使用正确。"
    },
    {
      "knowledgePointId": "vocabulary-id",
      "status": "INCORRECT",
      "scoreDelta": -10,
      "beforeScore": 30,
      "afterScore": 20,
      "noteZh": "词汇拼写错误。"
    }
  ]
}
```

## AI 输出约束

第一版默认模型暂定 DeepSeek v4 flash。代码层不写死供应商，统一从环境变量读取 base URL、API key 和模型名。

### 例句生成

要求：
- 输出 JSON。
- 只使用 N5 或接近 N5 的简单表达。
- 每条包含日语和中文释义。
- 日语例句必须自然，并包含目标知识点。

### 练习批改

要求：
- 输出 JSON。
- 不设置“部分正确”，每个受影响知识点只能是 `CORRECT` 或 `INCORRECT`。
- 至少判断目标知识点；如果答案中明显使用了其他已知词汇或语法，也要返回对应知识点判定。
- 每个知识点独立加减分：正确 `+20`，错误 `-10`。
- 词汇拼写错误只扣对应词汇；如果语法结构正确，对应语法仍然加分。
- 语法小错也扣对应语法，例如漏掉主题助词「は」。
- 理解类练习也使用同一规则：理解正确 `+20`，理解错误 `-10`。

## 配置

`.env` 需要支持：

```text
DATABASE_URL="file:./dev.db"
OPENAI_API_KEY=""
OPENAI_BASE_URL=""
OPENAI_MODEL="deepseek-v4-flash"
AI_VERIFY_TOKEN=""
```

如果缺少 AI 配置：
- 知识点浏览可用。
- 例句生成和批改按钮显示配置提示。
- 服务不应崩溃。

`POST /api/ai/verify` 仅用于部署联调，请求必须携带
`x-ai-verify-token`，其值与 Ubuntu 虚拟机 `.env` 中的
`AI_VERIFY_TOKEN` 一致。该令牌和 `OPENAI_API_KEY` 都不得写入源码或同步回
Windows 工作区。

## 部署设计

虚拟机部署目标：
- Ubuntu Server。
- 安装 Docker 和 Docker Compose。
- 应用通过 Docker Compose 启动。
- SQLite 数据库文件挂载到宿主机目录，避免容器重建丢失数据。

后续公开服务升级路径：
- SQLite 切换为 PostgreSQL。
- 加入登录和用户隔离。
- Nginx 反代。
- HTTPS。
- AI 调用限流和成本统计。

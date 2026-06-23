# 技术设计文档

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

保存一次用户练习。

关键字段：
- `id`
- `knowledgePointId`
- `userSentence`
- `isCorrect`
- `score`
- `feedbackZh`
- `correctedSentence`
- `model`
- `rawAiResponse`
- `createdAt`

### MasteryState

保存掌握度。

关键字段：
- `id`
- `knowledgePointId`
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

提交用户造句并批改。

请求：

```json
{
  "knowledgePointId": "string",
  "sentence": "日本語の文"
}
```

返回：

```json
{
  "isCorrect": true,
  "score": 0.9,
  "feedbackZh": "这个句子正确使用了目标词。",
  "correctedSentence": "..."
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

### 造句批改

要求：
- 输出 JSON。
- 只判断目标知识点是否被正确使用。
- 可以指出其他明显错误，但不要让无关错误主导评分。
- 分数范围 `0` 到 `1`。
- `isCorrect=true` 的建议阈值是 `score >= 0.75`。

## 配置

`.env` 需要支持：

```text
DATABASE_URL="file:./dev.db"
OPENAI_API_KEY=""
OPENAI_BASE_URL=""
OPENAI_MODEL="deepseek-v4-flash"
```

如果缺少 AI 配置：
- 知识点浏览可用。
- 例句生成和批改按钮显示配置提示。
- 服务不应崩溃。

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

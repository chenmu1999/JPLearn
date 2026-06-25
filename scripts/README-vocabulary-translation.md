# DeepSeek 词汇翻译工具

脚本：`scripts/translate_vocabulary_deepseek.py`

该工具接收日语表记、假名读音和英文参考释义，通过 DeepSeek 的 OpenAI 兼容接口生成简体中文释义。它只使用 Python 标准库，不需要安装额外依赖，要求 Python 3.9 或更高版本。

必须在 Ubuntu 虚拟机中运行。不要在 Windows 源码工作区调用 API。

## 配置

API Key 只通过环境变量提供，不要写入仓库：

```bash
export DEEPSEEK_API_KEY='你的 API Key'
export DEEPSEEK_BASE_URL='https://api.deepseek.com'
export DEEPSEEK_MODEL='deepseek-v4-pro'
```

工具也兼容项目已有的 `OPENAI_API_KEY`、`OPENAI_BASE_URL` 和 `OPENAI_MODEL`。`DEEPSEEK_*` 的优先级更高。

## 单条翻译

```bash
python3 scripts/translate_vocabulary_deepseek.py single \
  --word '預かる' \
  --reading 'あずかる' \
  --english 'to keep something for someone' \
  --level N3
```

标准输出是 JSON：

```json
{
  "expression": "預かる",
  "reading": "あずかる",
  "meaning_en": "to keep something for someone",
  "meaning_zh": "代为保管；暂时保管",
  "model": "deepseek-v4-pro"
}
```

## 批量翻译 CSV

默认处理 `data/vocabulary/jlpt/jlpt-vocabulary.csv` 中 `meaning_zh` 为空的行，并原子写回原文件：

```bash
python3 scripts/translate_vocabulary_deepseek.py csv
```

建议第一次先写入新文件并限制数量：

```bash
python3 scripts/translate_vocabulary_deepseek.py csv \
  --input data/vocabulary/jlpt/jlpt-vocabulary.csv \
  --output /tmp/jlpt-vocabulary-translated.csv \
  --level N5 \
  --limit 40 \
  --batch-size 20
```

审核后，如果要让 DeepSeek 重新翻译已有中文列：

```bash
python3 scripts/translate_vocabulary_deepseek.py csv \
  --output /tmp/jlpt-vocabulary-deepseek.csv \
  --force \
  --batch-size 20
```

常用参数：

- `--force`：重译已有 `meaning_zh` 的行。
- `--level N5`：只处理指定等级，可重复传入。
- `--limit 100`：本次最多处理 100 行。
- `--skip 800`：跳过筛选结果中的前 800 行，用于按已保存批次继续。
- `--random-seed 20260625`：在应用 `--limit` 前按固定种子随机排序，便于重复抽样审核。
- `--batch-size 20`：每次 API 请求包含 20 个词。
- `--checkpoint-every 1`：每成功一批就保存，便于断点续跑。
- `--model`、`--base-url`：临时覆盖环境变量。

## 安全与数据一致性

- API Key 不会写入 CSV 或日志。
- 模型必须返回与输入完全一致的 ID 集合，否则整批拒绝写入。
- CSV 使用临时文件完成原子替换，避免中途退出破坏原文件。
- API 限流或服务端错误会指数退避重试。
- 中断或失败时会保存已经成功完成的批次；再次执行时会跳过已有中文释义。
- 建议始终先输出到 `/tmp` 文件，抽样审核后再替换项目数据。

你正在继续实现 JPLearn 的背单词功能。

工作目录：
D:\Project\Web\JPLearn

开始前必须：

1. 完整阅读 AGENTS.md，严格遵守 Windows/Ubuntu 环境边界。
2. 确认当前分支是 codex/vocabulary-feature。
3. 查看 git status 和最近提交。
4. 阅读：
   - plan/database-design.md
   - plan/vocabulary-module-design.md
   - plan/vocabulary-module-execution-plan.md
5. 检查现有 Prisma、src/lib/vocabulary、词汇 API、页面、脚本和迁移。
6. 综合以下证据判断真实进度：
   - 实际源码是否存在且完整；
   - Git 提交历史；
   - database-design.md 的验证状态；
   - 每个 Batch 的完成标准。
7. 不要仅依据文档末尾“推荐的下一步”，也不要重复实现已完成内容。

当前已知状态仅供核对，不得盲目信任：

- Batch 1 已完成并在 Ubuntu 验证。
- Batch 2 已完成并在 Ubuntu 验证。
- Batch 3 已完成并在 Ubuntu 验证。
- 下一候选通常是 Batch 4，但必须以审计结果为准。

执行规则：

1. 找出第一个尚未完成或只完成一部分的 Batch。
2. 如该 Batch 部分完成，先补齐缺口，不重写已经正确实现的部分。
3. 完成后对照该 Batch 的验收标准进行静态复核。
4. 如果仍有时间和上下文，继续下一个依赖已满足的 Batch。
5. 每个 Batch 保持独立、可审查；完成一个 Batch 后单独提交。
6. 提交时只暂存本次背单词功能相关文件。
7. 不得提交、覆盖或清理现有聊天、认证及其他无关未提交改动。
8. 不推送远端。
9. 不使用 git reset --hard、git checkout -- 或其他破坏性命令。

环境约束：

- Windows 只允许查看、创建和修改源码、文档以及执行非项目运行性质的 Git 操作。
- Windows 禁止安装依赖、构建、类型检查、Lint、测试、迁移、导入、启动服务或调用 AI API。
- 只有 VM 可连接时，才允许在 Ubuntu 中执行上述验证。
- VM 无法连接时继续完成可安全实施的源码，并明确记录“源码已修改，尚未运行验证”。
- 不得因无法验证而伪造验证状态或把 Batch 标记为已验证。
- 不得在 Windows 上绕过限制进行快速验证。

停止条件：

- 计划全部完成；
- 遇到需要用户产品决策的问题；
- 需要破坏或覆盖现有无关改动；
- 缺少必要权限、凭据或外部服务；
- 剩余工作无法在当前上下文中安全完成。

结束时输出：

- 审计判断的起始 Batch；
- 本次完成和部分完成的 Batch；
- 创建的提交及哈希；
- 修改的主要内容；
- 已执行的 Ubuntu 验证及结果；
- 尚未验证的内容；
- 当前阻塞；
- 下一步应继续的 Batch。

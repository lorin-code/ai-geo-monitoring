# DeepSeek Search Implementation Plan

> **For agentic workers:** Execute this approved plan in the current session, task by task, using the test-driven-development skill. Commit and push the current branch as authorized by the user; no new branch is requested.

**Goal:** 为全部 DeepSeek 监测入口接入官方独立 Search API，并保存实际使用的来源。

**Architecture:** 平台服务统一编排搜索与对话、复用 HTTP 重试；独立搜索服务负责参数、上下文与引用映射。保留原有模型及数据结构。

**Tech Stack:** Node.js 22、CommonJS、Axios、Express、`node:test`。

## Global Constraints

- 用户已确认独立 Search API；只覆盖 DeepSeek 监测。
- 保持用户问题原文，不注入品牌/竞品引导词。
- 情绪判定和 Prompt 建议必须传入 `{ search: false }`。
- 搜索失败不静默降级；搜索无结果是有效响应。
- 不记录密钥或供应商原始错误载荷，不修改真实 `.env`。
- 不增加依赖，不新增分支；在用户授权后提交并推送当前分支。

### Task 1: 搜索协议与引用映射

**Files:** Create `backend/services/DeepSeekSearchService.js`, `backend/tests/DeepSeekSearchService.test.js`; modify `backend/services/CitationAnalysisService.js`, `backend/tests/CitationAnalysisService.test.js`.

**Interfaces:** `buildSearchRequest(question)` 返回官方请求体；`getApiUrl(chatUrl)` 返回搜索 URL；`normalizeResults(data, count = 10)` 验证并整理结果；`buildMessages(question, results)` 返回完整问题与独立搜索上下文；`attachSearchMetadata(data, results, query)` 返回保留原回答的注解与搜索状态。

- [x] 添加请求限制、上下文、引用选择和重复来源元数据的失败测试，并运行确认。
- [x] 实现纯协议处理，保留模型原回答，不把未引用的结果计入指标。
- [x] 运行 `node --test tests/DeepSeekSearchService.test.js tests/CitationAnalysisService.test.js`。

### Task 2: 公共调用编排

**Files:** Modify `backend/services/AIPlatformService.js`, `backend/tests/AIPlatformService.test.js`.

**Interfaces:** `queryPlatform(platform, question, options = {})` 保持现有成功/失败返回结构；`isSearchEnabled(platform, options = {})` 供流式路由判断；`requestPlatform(platform, url, data)` 复用 HTTP 请求策略。

- [x] 添加先搜索后对话、鉴权/余额失败、空结果、无效响应、配置关闭、搜索重试及聊天重试不重搜的失败测试。
- [x] 将既有 HTTP 逻辑提取为共用方法，编排搜索和回答并合计耗时。
- [x] 运行 `node --test tests/AIPlatformService.test.js tests/DeepSeekSearchService.test.js`。

### Task 3: 调用场景与流式结果

**Files:** Modify `backend/routes/detection.js`, `backend/routes/geoProjects.js`, `backend/services/SentimentAnalysisService.js`; extend relevant service tests and add `backend/tests/DetectionStream.test.js`.

- [x] 执行受控流式路由，验证开启搜索时复用公共调用并将回答及引用传入记录终结服务；关闭搜索时仍使用原生流式。
- [x] 测试情绪判定与 Prompt 建议的请求明确禁用搜索。
- [x] 修改调用参数和流式分支，使失败正常输出 SSE 错误。
- [x] 运行相关路由、任务、情绪及 Prompt 测试。

### Task 4: 配置与最终验证

**Files:** Modify `backend/.env.example`, `docs/ENVIRONMENT.md`, `README.md`.

- [x] 文档说明默认联网、关闭开关、网关 URL、结果条数、摘要上下文和独立计费。
- [x] 运行 `npm --prefix backend test`，检查 `git diff --check`。
- [x] 尝试一次官方 Search + 对话端到端调用，只输出脱敏状态、耗时和引用数量；若网络或供应商状态阻断，准确报告。
- [x] 对照设计验收引用不会包含未使用结果，完成差异审查。

## 验证结果

- 2026-10-18 后端完整测试：385 项通过，0 失败；`git diff --check` 通过。
- 独立只读复核确认引用编号与 Markdown 目标冲突、非空无效搜索结果两项问题已经修复，相关回归测试通过。
- 后端在本地 3002 端口通过健康检查。真实调用 Search 与 Chat 均返回 HTTP 200：搜索返回 3 条结果，回答提取到 3 个 `web_search` 引用；本次验证响应耗时 1461ms，回答 368 字符，`finish_reason=stop`。该耗时为单次联调记录，不代表性能保证。
- 真实回答暴露出 Markdown 反引号被包含在来源 URL 中的问题；已修正显式和裸 URL 的提取边界，先复现失败测试，再验证回归通过。修复后再次重启后端并完成真实联调，没有损坏的反引号链接。
- 未修改真实 `.env`、未新增依赖。

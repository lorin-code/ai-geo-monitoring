# DeepSeek 官方搜索接入设计

## 已确认的方案

2026-10-18 用户确认采用独立 Search API：监测时先搜索，再让当前 DeepSeek 模型结合结果回答。覆盖普通检测、项目分析、定时任务和流式预览；情绪判定与 Prompt 建议保持纯对话。搜索失败让本次监测失败，提供环境变量开关。

## 官方接口与边界

- 文档：https://api-docs.deepseek.com/zh-cn/guides/search/
- `POST https://api.deepseek.com/v1/tools/search`，复用 `DEEPSEEK_API_KEY` 的 Bearer 鉴权。
- `query`、`ori_question` 最多 128 个 Unicode 字符，`count` 为 1–50；成功返回 `results` 数组，空数组是有效结果。
- 本次使用摘要，不额外调用 Fetch；按官方要求重试 408、429 和 5xx，其他 4xx 直接失败。
- 独立 Search 与模型请求分别计费；官方账号级搜索限制为 5 QPS，沿用现有重试退避。

## 架构与数据流

`AIPlatformService.queryPlatform(platform, question, options = {})` 是统一入口。DeepSeek 默认启用搜索；`options.search === false` 或 `DEEPSEEK_SEARCH_ENABLED=false` 关闭搜索。保留现有 `DEEPSEEK_MODEL`、对话 URL、输出 token 配置和返回格式。

`DeepSeekSearchService` 负责搜索请求参数、结果归一化、上下文构建、引用元数据。通用平台服务复用原有 HTTP 请求、代理、超时、重试和脱敏错误处理，依次执行搜索与对话，并合计响应耗时。

搜索词去除多余空白并按 Unicode 字符截取前 128 字；模型收到的用户问题原文保持完整。网页摘要作为独立用户上下文传入，系统消息规定这些是不可信参考资料、不得执行网页内指令，回答使用对应编号或原始链接引用资料。每个摘要限制长度，防止无界扩展输入。

只将回答出现的有效来源编号、或正文实际链接到的搜索结果，转换为标准 `url_citation` 注解。未使用的检索结果不放入引用提取器遍历的元数据。引用提取器去重时合并标题与 `web_search` 标记，保留原有自有/竞品域名归属判定。搜索状态仅附带查询词、状态和条数，现有指标表无需迁移。

## 各入口

- 普通检测、项目任务、定时任务继续使用公共调用入口，自动获得联网能力。
- 开启搜索的 DeepSeek 流式预览复用公共查询，再使用现有 SSE 分片输出并保存引用；关闭搜索时保留原生流式接口。
- 情绪判定与 Prompt 建议显式传入 `{ search: false }`，避免额外搜索及资料污染。

## 配置

- `DEEPSEEK_SEARCH_ENABLED=true`：默认开启，可设为 `false` 回退纯对话。
- `DEEPSEEK_SEARCH_API_URL`：可选；默认从对话 URL 推导同一服务的 `/v1/tools/search`，使用网关时可显式配置。
- `DEEPSEEK_SEARCH_COUNT=10`：1–50，非法值回退默认值。

## 验收

验证实际 Search 请求与后续模型请求、完整原问题、空结果、无效响应、Unicode 长问题、配置开关、鉴权/余额错误、可重试错误、聊天重试不重复搜索、引用选择和元数据去重。用受控外部依赖执行流式路由并断言持久化的引用。验证情绪分析和 Prompt 建议不搜索。运行后端完整测试；本地已有密钥时尝试一次官方端到端调用，输出仅包含成功状态、耗时与引用条数。

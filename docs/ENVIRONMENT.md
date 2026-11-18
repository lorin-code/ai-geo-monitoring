# 环境变量与敏感信息

> 服务端配置保存在 `backend/.env`；用户模型密钥在个人中心校验并保存，加密存储在数据库中。

## 创建本地配置

从模板复制本地配置文件：

```bash
cp backend/.env.example backend/.env
cp nextjs-frontend/.env.example nextjs-frontend/.env.local
```

然后编辑 `backend/.env`，至少填写：

- `JWT_SECRET`
- `DEFAULT_ADMIN_PASSWORD`
- 模型密钥无需填写在环境变量中；登录后由每个用户在「个人中心 → 模型密钥」配置

真实 `.env` 文件已被 `.gitignore` 忽略，模板文件 `.env.example` 可以提交。

本地开发（`NODE_ENV=development`）以 `backend/.env` 中显式填写的值为准，覆盖继承自终端的同名变量，避免继承的配置干扰当前项目。生产环境仍优先使用部署平台注入的环境变量。修改后端配置后需要重启后端服务。

## 基本
- `PORT` 后端服务端口，模板为 `3002`；必须显式配置，代码不再回退到其他端口
- `NODE_ENV` 运行环境（`development`/`production`）
- `JWT_SECRET` **用户登录令牌签名密钥（必须设置强随机值，至少32字符）**

## 安全配置
- `ALLOWED_ORIGINS` CORS 允许的域名列表，逗号分隔
  - 本地值见 `backend/.env.example`，代码没有隐含的本地域名白名单
  - 生产示例：`https://example.com,https://www.example.com`

## 管理员初始化
- `DEFAULT_ADMIN_USERNAME` 默认管理员用户名（用于初始化 `id=1` 用户）
- `DEFAULT_ADMIN_EMAIL` 默认管理员邮箱
- `DEFAULT_ADMIN_PASSWORD` 默认管理员密码（仅用于初始化，**部署后必须立即修改**）

## 会员与设置
- `DEFAULT_MEMBERSHIP_LEVEL` 默认会员等级（`free`/`pro`/`enterprise`），初始化设置表时使用

## AI 平台与用户密钥
- 支持 DeepSeek、豆包、千问、Kimi。用户在「个人中心 → 模型密钥」填写官方密钥和模型 ID，点击「校验并保存」。校验会发起少量真实请求，成功后才写入数据库。
- 每个用户独立配置，未保存有效密钥的平台不可选择；后台接口、项目分析及定时任务也会检查权限。管理员运行他人项目时使用项目所有者的配置。
- 已保存的密钥用 AES-256-GCM 加密，带用户和平台的认证信息，只回显末四位。替换失败保留原配置；删除后停止新的平台调用，不删除历史报告。
- 可用平台状态从登录用户接口动态获取，前端不再使用旧的 NEXT_PUBLIC_MONITORING_PLATFORMS 开关。
- MONITORING_PLATFORMS：服务器允许的平台列表，默认 doubao,deepseek,qianwen,kimi。此配置只限制支持范围，实际可用性以用户验证通过的密钥为准。
- PLATFORM_CREDENTIAL_ENCRYPTION_KEY：可选，64 位十六进制随机值（32 字节）。未设置时首次保存自动创建 backend/.platform-credential-key（已忽略 Git）。生产多实例必须使用相同的独立加密密钥；备份数据库时同时备份它，丢失后已有凭证将无法解密。它独立于 JWT_SECRET，不受登录令牌密钥轮换影响。
- 旧的 DEEPSEEK_API_KEY / DOUBAO_API_KEY / QIANWEN_API_KEY / KIMI_API_KEY 不再用于用户调用，也不会自动导入用户账号。原配置不会使平台自动启用。
- 密钥只发送至代码中固定的官方地址，不接受用户自定义网关；模型 ID 可在个人中心修改并重新校验。
- 千问使用阿里云百炼中国内地地域的兼容接口，要求对应地域密钥与支持联网搜索的模型；豆包要求火山方舟开通的联网搜索模型 ID 或推理接入点。
- DEEPSEEK_SEARCH_ENABLED：DeepSeek 监测是否调用官方搜索，默认 true；DEEPSEEK_SEARCH_COUNT 为单次结果条数 1–50，默认 10。用户凭证固定调用官方 Search 地址，不使用旧的网关覆盖地址。
- 代理（可选）：HTTPS_PROXY 或 HTTP_PROXY 或 PROXY_URL。

Kimi 使用月之暗面官方 Chat Completions 和 Search Basic 接口，默认模型 `kimi-k3.1-pro`（可修改）。校验同时检查模型回答及搜索权限；监测先搜索再回答，仅记录实际引用的来源，搜索失败时本次监测失败。模型 token 与搜索分别计费。参考 [Kimi 搜索文档](https://platform.kimi.com/docs/api/tools-search.md)。

「Prompt 管理 → 生成 Prompt 建议」可在“生成模型”下拉框选择已校验的平台，显示个人中心保存的模型 ID。生成模型与项目监测平台可分别设置，建议生成使用纯对话，结果标明实际平台和模型。未配置或已删除密钥的平台不可生成；管理员操作他人项目时仍使用项目所有者的配置。

### DeepSeek 联网监测

复用用户保存的 DeepSeek 密钥，不需要额外搜索密钥。普通检测、项目分析、定时监测和流式预览默认先调用官方 Search API，再将搜索摘要交给用户配置的模型 回答。情绪判定和 Prompt 建议使用用户可用的平台，并保持纯对话。

搜索词按 Unicode 字符截取前 128 字，模型收到的用户问题原文保持完整。每条资料优先使用官方 `summary`，最多传入 2000 字；不额外调用 Fetch。只将回答使用的来源编号或链接保存为搜索引用，未使用的结果不计入引用指标。

搜索失败会让本次监测失败，不会自动退回无搜索回答；搜索成功但无结果时允许模型说明资料不足。开启搜索时，流式预览在完整回答生成后以 SSE 分片返回，并保存与普通检测相同的来源元数据；关闭搜索时 DeepSeek 保留原生流式输出。

Search 请求与模型 token 分别计费，Search 按产生非空结果的成功请求计费；系统会对 408、429 和 5xx 退避重试。价格与限速以 [DeepSeek 官方文档](https://api-docs.deepseek.com/zh-cn/guides/search/) 为准。

## 数据库
- `DB_STORAGE` SQLite 数据库文件路径（默认：`database.sqlite`）
- `DATABASE_URL` Postgres 连接串；生产环境配置后会优先使用 Supabase/Postgres
- 未配置 `DATABASE_URL` 时，后端继续使用 SQLite（默认 `database.sqlite`），已在 `.gitignore` 忽略

## Next.js 前端

唯一后端地址配置为 `API_BASE_URL`，位于 `nextjs-frontend/.env.local`（从同目录 `.env.example` 复制）。填写后端源站根地址，不带 `/api`、查询参数或用户名密码。浏览器、Axios 和通知页面统一请求同域 `/api/*`，Next.js 在服务端代理到该地址。修改后需要重启开发服务；生产部署需要重新构建。

代码不再包含 localhost 兜底地址，开发地址只在模板中提供。不设置 `API_BASE_URL` 时 Next.js 不创建代理规则，适用于由 Nginx 等外部代理处理 `/api` 的部署。已移除重复的 `NEXT_PUBLIC_API_BASE_URL`、`NEXT_PUBLIC_API_URL`、未使用的 `NEXT_PUBLIC_SITE_URL` 以及旧的前端平台开关。

仓库只保留前后端两份 `.env.example` 模板；本地真实配置及历史备份已清理。数据库和 `backend/.platform-credential-key` 是持久化数据，继续保留。

## 安全建议
- ⚠️ `.env` **绝对不要提交到 Git**；已在 `.gitignore` 中忽略
- ⚠️ 生产环境通过平台注入或安全分发机制配置环境变量
- ⚠️ `JWT_SECRET` **必须设置为强随机口令**（至少32字符，建议使用 crypto.randomBytes 生成）
- ⚠️ 默认管理员密码**仅用于首次初始化**，生产环境首次登录后必须立即修改
- ⚠️ 定期轮换 API 密钥和 JWT 密钥
- ⚠️ 生产环境设置 `ALLOWED_ORIGINS` 为实际使用的域名

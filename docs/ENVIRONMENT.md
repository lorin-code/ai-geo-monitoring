# 环境变量与敏感信息

> ⚠️ **所有敏感值放在 `backend/.env`，不要提交到仓库。**

## 创建本地配置

从模板复制本地配置文件：

```bash
cp backend/.env.example backend/.env
cp nextjs-frontend/.env.example nextjs-frontend/.env.local
```

然后编辑 `backend/.env`，至少填写：

- `JWT_SECRET`
- `DEFAULT_ADMIN_PASSWORD`
- 需要启用的平台 API Key，例如 `DOUBAO_API_KEY`、`DEEPSEEK_API_KEY`

真实 `.env` 文件已被 `.gitignore` 忽略，模板文件 `.env.example` 可以提交。

## 基本
- `PORT` 后端服务端口，开发环境当前使用 `3002`；代码默认值为 `3000`
- `NODE_ENV` 运行环境（`development`/`production`）
- `JWT_SECRET` **用户登录令牌签名密钥（必须设置强随机值，至少32字符）**

## 安全配置
- `ALLOWED_ORIGINS` CORS 允许的域名列表，逗号分隔
  - 本地开发建议包含：`http://localhost:3001,http://127.0.0.1:3001`
  - 生产示例：`https://example.com,https://www.example.com`

## 管理员初始化
- `DEFAULT_ADMIN_USERNAME` 默认管理员用户名（用于初始化 `id=1` 用户）
- `DEFAULT_ADMIN_EMAIL` 默认管理员邮箱
- `DEFAULT_ADMIN_PASSWORD` 默认管理员密码（仅用于初始化，**部署后必须立即修改**）

## 会员与设置
- `DEFAULT_MEMBERSHIP_LEVEL` 默认会员等级（`free`/`pro`/`enterprise`），初始化设置表时使用
- `QUOTA_LOW_THRESHOLD` 配额低阈值（0-1之间的小数），用于通知提示

## AI 平台
- `DOUBAO_API_KEY`、`DOUBAO_API_URL`、`DOUBAO_MODEL`
- `DEEPSEEK_API_KEY`、`DEEPSEEK_API_URL`、`DEEPSEEK_MODEL`
- `DEEPSEEK_SEARCH_ENABLED` DeepSeek 监测是否调用官方搜索，默认 `true`；设为 `false` 使用纯对话
- `DEEPSEEK_SEARCH_COUNT` 单次搜索结果条数，整数 `1`–`50`，默认 `10`，非法值回退默认值
- `DEEPSEEK_SEARCH_API_URL` 可选搜索地址，默认由 `DEEPSEEK_API_URL` 推导同一服务下的 `/v1/tools/search`；网关不支持该路径时需要显式配置
- `KIMI_API_KEY`、`KIMI_API_URL`
- `QIANWEN_API_KEY`、`QIANWEN_API_URL`
- 代理（可选）：`HTTPS_PROXY` 或 `HTTP_PROXY` 或 `PROXY_URL`

### DeepSeek 联网监测

复用 `DEEPSEEK_API_KEY`，不需要额外搜索密钥。普通检测、项目分析、定时监测和流式预览默认先调用官方 Search API，再将搜索摘要交给当前 `DEEPSEEK_MODEL` 回答。情绪判定和 Prompt 建议生成始终保持纯对话。

搜索词按 Unicode 字符截取前 128 字，模型收到的用户问题原文保持完整。每条资料优先使用官方 `summary`，最多传入 2000 字；不额外调用 Fetch。只将回答使用的来源编号或链接保存为搜索引用，未使用的结果不计入引用指标。

搜索失败会让本次监测失败，不会自动退回无搜索回答；搜索成功但无结果时允许模型说明资料不足。开启搜索时，流式预览在完整回答生成后以 SSE 分片返回，并保存与普通检测相同的来源元数据；关闭搜索时 DeepSeek 保留原生流式输出。

Search 请求与模型 token 分别计费，Search 按产生非空结果的成功请求计费，账号级限制为 5 QPS；系统会对 408、429 和 5xx 退避重试。价格与限速以 [DeepSeek 官方文档](https://api-docs.deepseek.com/zh-cn/guides/search/) 为准。

## 数据库
- `DB_STORAGE` SQLite 数据库文件路径（默认：`database.sqlite`）
- `DATABASE_URL` Postgres 连接串；生产环境配置后会优先使用 Supabase/Postgres
- 未配置 `DATABASE_URL` 时，后端继续使用 SQLite（默认 `database.sqlite`），已在 `.gitignore` 忽略

## SEO 设置（可选）
- `SEO_TITLE` 网站 SEO 标题
- `SEO_DESCRIPTION` 网站 SEO 描述
- `SEO_KEYWORDS` 网站 SEO 关键词
- `SEO_ROBOTS` 搜索引擎爬虫策略（默认：`index,follow`）

## Next.js 前端
- `NEXT_PUBLIC_API_BASE_URL` 客户端 axios 使用的 API 地址，开发默认 `http://localhost:3002`
- `NEXT_PUBLIC_API_URL` API 地址别名，开发默认 `http://localhost:3002`
- `NEXT_PUBLIC_SITE_URL` 前端站点地址，开发默认 `http://localhost:3001`
- `API_BASE_URL` Next.js rewrites 使用的后端地址，开发默认 `http://localhost:3002`
- 生产同域部署时，客户端 API 地址建议配置为 `/api`，由 Nginx 反向代理到后端

## 安全建议
- ⚠️ `.env` **绝对不要提交到 Git**；已在 `.gitignore` 中忽略
- ⚠️ 生产环境通过平台注入或安全分发机制配置环境变量
- ⚠️ `JWT_SECRET` **必须设置为强随机口令**（至少32字符，建议使用 crypto.randomBytes 生成）
- ⚠️ 默认管理员密码**仅用于首次初始化**，生产环境首次登录后必须立即修改
- ⚠️ 定期轮换 API 密钥和 JWT 密钥
- ⚠️ 生产环境设置 `ALLOWED_ORIGINS` 为实际使用的域名

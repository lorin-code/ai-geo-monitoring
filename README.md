# GoodieAI GEO Monitoring System

GoodieAI GEO Monitoring System 是一个面向 Generative Engine Optimization（GEO）的监测系统，用于观察品牌在 AI 搜索、AI 问答和大模型回答中的曝光、提及、推荐与引用来源表现。

## 更新说明

### 2026-10-18：DeepSeek 官方搜索接入

- 接入 DeepSeek 官方独立 Search API，监测时先搜索再由当前模型结合资料回答，覆盖普通检测、项目分析、定时监测与流式预览。
- 默认开启搜索，复用现有 `DEEPSEEK_API_KEY`；新增搜索开关、结果条数与自定义接口地址配置，详见 [环境变量说明](docs/ENVIRONMENT.md#deepseek-联网监测)。
- 仅将回答实际使用的搜索结果记录为搜索引用，保留来源标题与搜索标记；修复重复来源丢失元数据、引用编号与链接目标冲突，以及 Markdown 反引号污染 URL 的问题。
- 情绪判定和 Prompt 建议生成保持纯对话；搜索失败会让本次监测失败，避免静默回退为无搜索回答。
- 后端 385 项测试通过；真实联调中 Search 与模型回答均返回 HTTP 200，完成搜索结果、回答与引用提取验证。

## 系统演示

### 品牌项目工作台
![品牌项目工作台](docs/images/readme-projects.png)

### 项目可见度看板
![项目可见度看板](docs/images/readme-dashboard.png)

### Prompt 库管理
![Prompt 库管理](docs/images/readme-prompts.png)

### 情绪判断与最近指标
![情绪判断与最近指标](docs/images/readme-sentiment.png)

### 信源引用与 URL 明细
![信源引用与 URL 明细](docs/images/readme-sources.png)

## 核心功能

- 品牌项目创建、归档、恢复与删除
- GEO 检测任务创建、调度与执行记录
- 多平台 AI 回答结果监测，当前重点支持豆包、DeepSeek
- 豆包联网搜索调用与引用来源提取
- DeepSeek 官方 Search API 联网监测与实际引用来源提取，复用现有 API Key，可通过 `DEEPSEEK_SEARCH_ENABLED=false` 关闭
- 品牌提及率、Share of Voice、引用率、竞品曝光分析
- AI 回答情绪判断，支持正向、中性、负向标签与风险项沉淀
- Prompt 库管理、分类、平台选择与历史结果追踪
- 引用来源按自有来源、竞品来源、第三方来源聚合分析，并保留域名、URL、平台、Prompt 分类和出现时间
- 用户登录、权限、会员等级与额度管理
- 管理后台：用户、任务、会员、系统配置与运行记录管理
- 本地 SQLite 自动初始化，生产环境支持外部 Postgres 数据库

## 分析能力

### 情绪判断

系统会在品牌被 AI 回答提及时，对回答语义进行情绪判断，并在项目看板、最近指标和历史记录中展示情绪标签。当前结果会归一为正向、中性、负向等状态，便于识别品牌在 AI 回答中的推荐倾向、风险表述和口碑变化。

### 信源引用

系统会从联网回答和模型返回的引用元数据中提取来源，按域名和 URL 聚合，并区分自有来源、竞品来源、第三方来源、媒体内容等类型。来源分析页可查看总引用数、有引用回答、来源域名、竞品来源缺口、新增/流失/保留引用域名，以及具体 URL 明细，帮助判断 AI 回答更依赖哪些页面和内容来源。

## 适用场景

- 品牌在 AI 搜索结果中的可见性监测
- GEO / AEO / AI Search Optimization 数据分析
- 生成式搜索引擎中的竞品曝光研究
- AI 平台回答内容、情绪倾向与引用来源的长期追踪
- Prompt 表现、平台差异与优化机会分析

## 当前架构

- 前端：Next.js，目录为 `nextjs-frontend/`
- 后端：Node.js + Express，目录为 `backend/`
- 数据库：本地默认 SQLite；生产环境可通过 `DATABASE_URL` 使用外部 Postgres
- 部署方式：支持前后端分离部署，也可以部署到自有服务器或支持 Node.js 常驻服务的平台
- API 访问：前端可通过 `/api/*` 代理到后端服务

## 快速开始

首次安装依赖：

```bash
npm install
cd backend && npm install
cd ../nextjs-frontend && npm install
```

创建本地环境变量文件：

```bash
cp backend/.env.example backend/.env
cp nextjs-frontend/.env.example nextjs-frontend/.env.local
```

然后编辑 `backend/.env`，至少填写：

- `JWT_SECRET`
- `DEFAULT_ADMIN_PASSWORD`
- 需要启用的平台 API Key，例如 `DOUBAO_API_KEY`、`DEEPSEEK_API_KEY`

生产环境还应配置 `ALLOWED_ORIGINS`，并通过环境变量注入 `DATABASE_URL`、AI 平台密钥等敏感配置。

统一启动前后端：

```bash
npm run dev
```

默认地址：

- 前端：`http://localhost:3001`
- 后端：`http://localhost:3002`
- 健康检查：`http://localhost:3002/api/health`

## 常用命令

```bash
npm run dev          # 同时启动后端和 Next.js 前端
npm run dev:backend  # 只启动后端
npm run dev:frontend # 只启动前端
npm run build        # 构建 Next.js 前端
npm run lint         # 检查 Next.js 前端
```

后端测试：

```bash
cd backend
npm test
```

## 生产部署

生产环境建议：

- 前端和后端可以分离部署，也可以由同一台服务器反向代理
- 后端需要运行在支持常驻 Node.js 进程的环境中
- 数据库建议使用外部 Postgres，并通过 `DATABASE_URL` 配置
- 前端如需同域调用后端 API，可配置 `API_BASE_URL` 作为代理目标

后端生产环境必须配置强随机 `JWT_SECRET`、生产域名白名单 `ALLOWED_ORIGINS`、`DATABASE_URL` 和实际使用的 AI 平台密钥。不要把真实配置文件、访问令牌、数据库连接串或 API Key 提交到仓库。

更多部署细节见 [部署与运维](docs/DEPLOYMENT.md)。

## 默认账号

- 管理员用户名默认由 `backend/.env` 中的 `DEFAULT_ADMIN_USERNAME` 控制
- 管理员初始密码由 `backend/.env` 中的 `DEFAULT_ADMIN_PASSWORD` 控制
- 生产环境部署后必须立即修改默认管理员密码

不要在 README、Issue、提交记录或聊天记录中公开生产账号、密码、JWT、API Key、数据库连接串等敏感信息。

## 文档

- [文档总览](docs/README.md)
- [接口文档](docs/API.md)
- [环境变量](docs/ENVIRONMENT.md)
- [部署与运维](docs/DEPLOYMENT.md)
- [安全加固说明](docs/SECURITY.md)

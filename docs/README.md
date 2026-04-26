# 文档总览

本目录包含项目的使用说明、接口文档、环境变量与部署指南。

## 快速开始

- 首次安装依赖：
  - `npm install`
  - `cd backend && npm install`
  - `cd ../nextjs-frontend && npm install`
- 统一启动前后端：
  - 在项目根目录执行 `npm run dev`
  - Next.js 前端默认运行在 `http://localhost:3001`
  - 后端 API 默认运行在 `http://localhost:3002`
  - 健康检查：`GET http://localhost:3002/api/health`
- 单独启动：
  - 后端：`npm run dev:backend`
  - Next.js 前端：`npm run dev:frontend`

## 目录说明

- `API.md`：后端接口说明（路径、参数、返回示例）
- `ENVIRONMENT.md`：环境变量与敏感信息管理
- `DEPLOYMENT.md`：部署与运维建议
- `SECURITY.md`：安全加固说明与最佳实践

## 重要约定

- 所有后端接口前缀为 `/api`（参考 `backend/app.js`）
- **所有需要认证的接口都必须携带有效的 JWT Token**
- 管理员接口需要管理员身份；用户接口需要登录令牌
- `.env` 与 `database.sqlite` 不应被提交到仓库（已在项目根 `.gitignore` 忽略）

## 安全特性

- **完整认证授权**：所有检测、统计相关接口都需要身份验证
- **所有权验证**：用户只能访问自己的数据，防止水平越权
- **速率限制**：
  - 通用 API：500 次/15 分钟
  - 定时任务 API：1000 次/15 分钟
  - 登录接口：5 次/15 分钟（防暴力破解）
- **安全HTTP头**：使用 Helmet 中间件自动添加安全相关头
- **请求大小限制**：1MB 限制防止 DoS 攻击
- **CORS 白名单**：仅允许配置的域名跨域访问
- **会员自动降级**：过期会员自动降级为免费用户
- **配额原子操作**：使用数据库原子操作防止竞态条件

## 功能特性

- 多平台检测：支持豆包（Doubao）、DeepSeek、Kimi、千问。
- 批量问题：支持按行输入多个问题并同时检测。
- 关键词高亮与统计：对原文进行关键词高亮，并统计出现次数（含英文词边界）。
- 历史记录：按时间、平台、状态筛选，支持查看详情、删除、清空、导出。
- 流式结果（SSE）：部分平台结果以增量流式显示，提升反馈速度。
- 统计看板：展示总检测次数、平均推荐率、平均曝光率。
- 导出能力：
  - 历史记录导出为 CSV（中文平台与状态、关键词统计列）。
  - 历史详情一键导出为 PNG 图片（`YYYYMMDD-问题.png`）。

## 技术架构

- 前端：Next.js + React + Ant Design
  - Markdown 渲染：`react-markdown` + `remark-gfm`
  - 关键词高亮：自定义 `remarkKeywordHighlight`
  - 图片导出：`html-to-image`
- 后端：Node.js（Express）
  - ORM/数据库：Sequelize + SQLite（`database.sqlite`）
  - 路由：REST API + SSE 流式接口

## 项目结构

```
backend/        # Node.js (Express) 后端
  .env          # 环境变量 (数据库配置, API密钥)
  app.js        # 应用主文件
  config/       # 数据库配置
  models/       # Sequelize 模型
  routes/       # API 路由
  services/     # 业务逻辑服务
docs/           # 项目文档
nextjs-frontend/ # Next.js 前端
  src/app/      # App Router 页面
  src/components/
  public/
```

## 使用说明

- 在首页选择检测平台，输入问题与关键词（支持批量问题，逐行输入）。
- 点击“开始检测”后，可在结果区看到实时/流式文本与关键词统计。
- 打开右侧“历史记录”抽屉，支持：筛选、分页、查看详情、删除、清空、导出。
- 统计卡片显示累计与平均指标，便于宏观把控模型表现。

## 导出功能

### 导出历史记录（CSV）
- 入口：右侧“历史记录”抽屉中的“导出”。
- 列：`检测时间、问题、平台、状态、关键词统计`。
- 平台与状态中文化；关键词统计以 `关键词 × 次数`，多项用 `；` 分隔。
- 自动处理 CSV 字段中的逗号/引号/换行，避免列错位。
- 文件名：`history_export.csv`。

### 导出历史详情为图片（PNG）
- 入口：在“历史记录”列表点击“查看详情”，弹窗右上点击“导出图片”。
- 导出范围：弹窗中详情内容区（基本信息 + 详细结果），不包含操作按钮。
- 文件名：`YYYYMMDD-问题.png`。
  - 日期来源：服务端记录时间 `createdAt`，按 UTC 计算 `YYYYMMDD`，与服务器日期严格一致。
  - 问题文本：清理不合法文件名字符（`\ / : * ? " < > |`），并截断至约 60 字符。
- 清晰度：`html-to-image`，背景白色、像素倍率 2。

## 后端 API（概要）

- `GET /api/detection/history/:userId` — 查询历史记录
  - Query 参数：`page, limit, platform, status, q`
- `DELETE /api/detection/history/:userId` — 清空（按筛选范围）历史
- `DELETE /api/detection/record/:id` — 删除单条记录
- `GET /api/detection/status/:recordId` — 轮询某条记录的状态
- `GET /api/detection/stream?user_id=&platform=&question=&brand_keywords=` — 启动流式（SSE）
- `GET /api/statistics/user/:userId` — 用户统计数据
- `GET /api/platforms/ping` — 平台连通性自检

更多字段与返回示例详见 `API.md`。

## 生成参数与可调项

- 生成温度（后端服务层）：`temperature = 0.7`。
- 最大 Token 等参数：可在后端服务中按平台策略设置。

## 开发与运维建议

- 同时运行前后端时优先使用根目录 `npm run dev`；如需变更端口，请同步调整启动脚本、Next.js rewrites 与后端 `PORT`。
- 若 CSV 在 Excel/Numbers 中显示乱码，请确保以 UTF-8 打开或使用导入向导。
- 图片导出时若内容较长，建议滚动至需要的区域后再导出，以获得最佳视觉效果。

## 许可与声明

本项目用于学习与演示目的，默认不包含商业授权条款。若需商用或二次开发，请根据实际情况补充许可证并遵循各平台 API 使用规范。

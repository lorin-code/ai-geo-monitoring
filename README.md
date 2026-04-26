# AI GEO Monitoring System

AI GEO Monitoring System 是一个面向 Generative Engine Optimization（GEO）的监测系统，用于观察品牌在 AI 搜索、AI 问答和大模型回答中的曝光、提及与推荐表现。

## 当前架构

- 前端：Next.js，目录为 `nextjs-frontend/`
- 后端：Node.js + Express，目录为 `backend/`
- 数据库：SQLite，默认文件为 `backend/database.sqlite`

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

然后编辑 `backend/.env`，至少填写 `JWT_SECRET`、`DEFAULT_ADMIN_PASSWORD` 和需要使用的 AI 平台 API Key。

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

## 默认账号

- 管理员：`admin`
- 默认密码：以 `backend/.env` 中的 `DEFAULT_ADMIN_PASSWORD` 为准
- 演示用户：`demo`
- 演示用户默认密码：`demo-password`

生产环境部署后必须立即修改默认管理员密码。

## 文档

- [文档总览](docs/README.md)
- [接口文档](docs/API.md)
- [环境变量](docs/ENVIRONMENT.md)
- [部署与运维](docs/DEPLOYMENT.md)
- [安全加固说明](docs/SECURITY.md)

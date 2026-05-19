# Next.js Frontend

这是 AI GEO Monitoring System 的 Next.js 前端。

## Getting Started

项目根目录已提供统一启动脚本，开发时优先在根目录执行：

```bash
npm run dev
```

如需单独启动前端：

```bash
cd nextjs-frontend
npm run dev -- --webpack -p 3001
```

默认访问地址：`http://localhost:3001`。

## Environment

开发环境可在 `.env.local` 中配置：

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:3002
NEXT_PUBLIC_API_URL=http://localhost:3002
NEXT_PUBLIC_SITE_URL=http://localhost:3001
API_BASE_URL=http://localhost:3002
```

生产同域部署时，客户端 API 地址建议使用 `/api`，由 Nginx 或 Vercel rewrites 反向代理到后端。

Vercel 部署时：

```bash
NEXT_PUBLIC_API_BASE_URL=/api
NEXT_PUBLIC_API_URL=/api
NEXT_PUBLIC_SITE_URL=https://your-vercel-domain.vercel.app
API_BASE_URL=https://api.example.com
```

`API_BASE_URL` 填后端源站根地址，不要带 `/api`。

## Commands

```bash
npm run build
PORT=3001 npm run start
npm run lint
```

部署细节见 `../docs/DEPLOYMENT.md` 和 `../docs/VERCEL.md`。

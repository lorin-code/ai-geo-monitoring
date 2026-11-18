# Next.js Frontend

这是 AI GEO Monitoring System 的 Next.js 前端。

## 启动

从仓库根目录复制配置模板并编辑：

```bash
cp backend/.env.example backend/.env
cp nextjs-frontend/.env.example nextjs-frontend/.env.local
npm run dev
```

单独启动前端可使用根目录的 `npm run dev:frontend`。

## API 配置

前端配置文件只需要 `API_BASE_URL` 一个字段，填写后端源站根地址，不带 `/api`。开发示例见同目录 `.env.example`，生产示例为 `API_BASE_URL=https://api.example.com`。

所有浏览器请求（包括通知页面）都使用同域 `/api/*`，由 Next.js 代理到该地址。代码中没有 localhost 回退地址，也无需重复配置 NEXT_PUBLIC API 地址或站点 URL。若由 Nginx 处理 `/api`，可不设置 `API_BASE_URL`。修改代理地址后需重启开发服务或重新构建生产版本。

AI 平台密钥由用户在个人中心校验并保存，不写入环境变量。

## 检查

```bash
npm run build
npm run lint
```

部署细节见 `../docs/DEPLOYMENT.md` 和 `../docs/VERCEL.md`。

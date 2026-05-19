# Vercel 部署

本仓库是 Next.js 前端、Express 后端和 SQLite 数据库分离的结构。推荐部署方式是：

- Vercel 只部署 `nextjs-frontend/`
- `backend/` 部署到支持常驻 Node.js 服务和持久化磁盘/数据库的平台，例如云服务器、Railway、Render、Fly.io 等
- 生产数据库继续使用 SQLite 时必须有持久化磁盘；更推荐迁移到托管 MySQL

## 1. 先部署后端

后端需要先有一个公网 HTTPS 地址，例如：

```bash
https://api.example.com
```

后端生产环境至少设置：

```bash
NODE_ENV=production
PORT=3002
JWT_SECRET=<强随机值，至少32字符>
DEFAULT_ADMIN_PASSWORD=<强随机密码>
ALLOWED_ORIGINS=https://your-vercel-domain.vercel.app,https://your-domain.com
DB_STORAGE=database.sqlite
```

如果使用 AI 平台能力，还需要补充对应平台的 API Key。

确认后端健康检查可访问：

```bash
curl https://api.example.com/api/health
```

## 2. 在 Vercel 导入前端

在 Vercel Dashboard 新建 Project 并导入这个 Git 仓库。

关键设置：

- Root Directory: `nextjs-frontend`
- Framework Preset: `Next.js`
- Build Command: 保持默认 `next build`
- Install Command: 保持默认 `npm install` 或 `npm ci`

Vercel 官方 monorepo 文档建议导入仓库时为每个项目选择对应的 Root Directory；这里应选择 `nextjs-frontend`。

## 3. 配置 Vercel 环境变量

推荐让浏览器始终访问同域 `/api`，再由 Next.js rewrites 代理到真实后端。

在 Vercel Project Settings -> Environment Variables 添加：

```bash
NEXT_PUBLIC_API_BASE_URL=/api
NEXT_PUBLIC_API_URL=/api
NEXT_PUBLIC_SITE_URL=https://your-vercel-domain.vercel.app
API_BASE_URL=https://api.example.com
```

注意：

- `API_BASE_URL` 填后端源站根地址，不要带 `/api`
- `NEXT_PUBLIC_SITE_URL` 换成最终访问域名
- 修改环境变量后需要重新部署才会生效

## 4. 验证

部署完成后检查：

```bash
curl https://your-vercel-domain.vercel.app/api/health
```

如果返回 `{"status":"OK" ...}`，说明 Vercel 到后端的 API 代理已经打通。

随后访问：

```bash
https://your-vercel-domain.vercel.app/login
```

用管理员账号登录，并立即修改默认管理员密码。

## 常见问题

- `/api/health` 404：检查 Vercel 的 `API_BASE_URL` 是否已配置，并重新部署。
- CORS 报错：检查后端 `ALLOWED_ORIGINS` 是否包含 Vercel 生产域名和自定义域名。
- 登录失败或 401：确认 `JWT_SECRET` 在后端生产环境已设置，并且后端服务使用的是同一个数据库。
- 数据丢失：不要把生产 SQLite 放在临时文件系统；使用持久化磁盘，或迁移到托管数据库。

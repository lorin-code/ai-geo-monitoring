# 部署与运维

## 前提条件
- 已安装 `Node.js >= 18` 与 `npm >= 9`
- 服务器具备 Nginx 或其他反向代理能力
- 已准备域名与证书（建议启用 HTTPS）

## 环境变量与配置
- 本地开发可先复制模板：
  ```bash
  cp backend/.env.example backend/.env
  cp nextjs-frontend/.env.example nextjs-frontend/.env.local
  ```
- 在服务器创建 `backend/.env` 并设置关键变量（示例）：
  ```bash
  PORT=3002
  NODE_ENV=production
  JWT_SECRET=<强随机值，至少32字符>
  ALLOWED_ORIGINS=https://example.com,https://www.example.com

  DEFAULT_ADMIN_USERNAME=admin
  DEFAULT_ADMIN_EMAIL=admin@example.com
  DEFAULT_ADMIN_PASSWORD=<强随机值>

  # AI 平台密钥
  DEEPSEEK_API_KEY=<你的密钥>
  DOUBAO_API_KEY=<你的密钥>
  KIMI_API_KEY=<你的密钥>
  QIANWEN_API_KEY=<你的密钥>

  # 可选代理
  HTTPS_PROXY=http://proxy.example.com:8080
  ```
- 在 `nextjs-frontend/.env.production` 中设置前端构建变量（示例）：
  ```bash
  NEXT_PUBLIC_API_BASE_URL=/api
  NEXT_PUBLIC_API_URL=/api
  NEXT_PUBLIC_SITE_URL=https://example.com
  API_BASE_URL=http://127.0.0.1:3002
  ```
- **重要**：
  - `JWT_SECRET` 必须使用强随机值（建议使用 `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` 生成）
  - `ALLOWED_ORIGINS` 必须设置为实际使用的域名，多个域名用逗号分隔
  - **部署后立即修改默认管理员密码**
- 当前数据库配置为 SQLite（`backend/config/database.js`，默认 `database.sqlite`）。生产建议迁移到托管数据库（如 MySQL）并调整此文件。

## 构建与运行（生产）
- 安装依赖：
  - `npm ci`
  - `cd backend && npm ci`
  - `cd ../nextjs-frontend && npm ci`
- 前端构建：
  - 在项目根目录执行 `npm run build`
- 后端：
  - `cd backend && npm run start`
  - 建议使用进程管理器接管（PM2 或 systemd），并将日志滚动输出
- 前端：
  - `cd nextjs-frontend && PORT=3001 npm run start`
  - 建议通过进程管理器接管 Next.js 服务，并由 Nginx 反向代理到 Next.js 监听端口

## Nginx 反向代理示例
- 单域部署（前后端同域，避免跨域）：
  - 假设 Next.js 前端在本机 `http://127.0.0.1:3001`，后端在本机 `http://127.0.0.1:3002`
```
server {
    listen 80;
    server_name example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name example.com;

    # SSL 证书配置（示例）
    ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

    # 后端 API 反代（保持 /api 前缀）
    location /api/ {
        proxy_pass http://127.0.0.1:3002/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_http_version 1.1;

        # SSE 建议关闭缓冲并延长超时
        proxy_buffering off;
        proxy_read_timeout 1h;
    }

    # Next.js 前端
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## 验证与健康检查
- 健康检查：`GET https://<你的域名>/api/health`
- 平台密钥自检：`GET https://<你的域名>/api/platforms/ping`
- 登录验证：使用默认管理员登录并立即修改密码（见下方安全建议）

## 安全与合规建议
- ⚠️ **JWT_SECRET 必须设置为强随机值**（至少32字符），使用默认值会导致严重安全风险
- ⚠️ **部署后立即修改默认管理员密码**
- ⚠️ **设置 ALLOWED_ORIGINS** 为实际使用的域名，不要使用通配符
- ⚠️ 启用 HTTPS（Nginx/TLS），并配置有效的 SSL 证书
- ✅ 系统已包含以下安全措施：
  - Helmet 安全头中间件（自动添加安全相关 HTTP 头）
  - 速率限制（通用 API 500次/15分钟，定时任务 API 1000次/15分钟，登录 5次/15分钟）
  - 请求体大小限制（1MB）防止 DoS 攻击
  - CORS 白名单（仅允许配置的域名访问）
  - 完整的认证授权（所有 API 都需要身份验证）
  - 所有权验证（用户只能访问自己的数据）
  - 会员过期自动降级
  - 配额原子操作（防止竞态条件）
- 如需前后端分域部署，必须在 `.env` 中配置 `ALLOWED_ORIGINS`
- 建议配置 WAF（如 Cloudflare、AWS WAF）提供额外防护
- 定期更新依赖包：`npm audit fix`

## 常见问题排查
- API Key 未配置：`/api/platforms/ping` 显示未配置，请在 `backend/.env` 补充对应密钥
- 429/网络错误：后端已包含重试与代理支持，设置 `HTTPS_PROXY`/`HTTP_PROXY` 即可
- SSE 推流中断：检查 Nginx `proxy_buffering off` 与 `proxy_read_timeout` 配置
- CORS 错误：检查 `ALLOWED_ORIGINS` 是否包含前端域名
- 认证失败（401）：确保请求头包含 `Authorization: Bearer <token>`
- 权限不足（403）：检查用户是否有权访问该资源（用户只能访问自己的数据）
- 速率限制（429）：默认限制通用 API 500次/15分钟，定时任务 API 1000次/15分钟，登录 5次/15分钟
- JWT 配置错误：确保 `JWT_SECRET` 已设置为强随机值

## 进程管理示例（可选）
- 使用 systemd（示例）：
```
[Unit]
Description=AI GEO Monitoring System Backend
After=network.target

[Service]
Type=simple
WorkingDirectory=/srv/ai-geo-monitoring-system/backend
Environment=NODE_ENV=production
EnvironmentFile=/srv/ai-geo-monitoring-system/backend/.env
ExecStart=/usr/bin/node app.js
Restart=always

[Install]
WantedBy=multi-user.target
```
- 安装后执行：`systemctl daemon-reload && systemctl enable --now ai-geo-monitoring-system-backend.service`
- Next.js 前端也可使用独立 systemd 服务托管，核心命令为：
  - `WorkingDirectory=/srv/ai-geo-monitoring-system/nextjs-frontend`
  - `ExecStart=/usr/bin/env PORT=3001 npm run start`

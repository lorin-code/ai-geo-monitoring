# 安全加固说明

本文档说明了项目的安全特性和加固措施。

## 🔐 已实施的安全措施

### 1. 认证与授权

#### 完整的身份验证
- 所有需要认证的 API 接口都使用 `authRequired` 中间件保护
- JWT Token 必须在请求头中携带：`Authorization: Bearer <token>`
- 未认证请求返回 `401 Unauthorized`

#### 所有权验证（防水平越权）
- 用户只能访问自己的数据
- 管理员可以访问所有数据
- 越权访问返回 `403 Forbidden`
- 受保护的接口：
  - `/api/detection/history/:userId` - 查看检测历史
  - `/api/statistics/*` - 统计数据
  - 删除和更新操作

#### JWT 安全
- 强制配置 `JWT_SECRET`，无 fallback
- 密钥长度至少 32 字符
- 使用加密安全的随机数生成

### 2. 速率限制

#### 通用 API 限制
- **限制**：500 次/15 分钟
- **作用域**：所有 `/api/*` 路径
- **超出限制**：返回 `429 Too Many Requests`

#### 定时任务接口限制
- **限制**：1000 次/15 分钟
- **作用域**：`/api/schedules/*`
- **目的**：支持定时任务批量操作，同时保留限流保护

#### 登录接口限制
- **限制**：5 次/15 分钟
- **作用域**：`POST /api/users/login`
- **目的**：防止暴力破解和暴力攻击

### 3. HTTP 安全

#### Helmet 安全头
自动添加以下安全相关的 HTTP 头：
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `X-XSS-Protection: 1; mode=block`
- `Strict-Transport-Security` (HTTPS 环境)
- 其他安全相关的头

#### 请求体大小限制
- **限制**：1MB
- **目的**：防止 DoS 攻击和内存溢出

### 4. CORS 配置

#### 白名单机制
- 仅允许配置的域名跨域访问
- 环境变量：`ALLOWED_ORIGINS`
- 格式：逗号分隔的域名列表
- 示例：`https://example.com,https://www.example.com`

#### 凭证支持
- 启用 `credentials: true`
- 支持携带 Cookie 和 Authorization 头

### 5. 业务逻辑安全

#### 会员自动降级
- 会员过期自动降级为免费用户
- 检查 `membership_expires_at` 字段
- 过期用户无法使用付费功能

#### 配额原子操作
- 使用数据库 `increment` 原子操作
- 防止竞态条件
- 避免配额超额使用

#### 验证码安全
- 使用 `crypto.randomBytes` 生成随机 ID
- 不可预测，防止暴力破解

### 6. 数据保护

#### 敏感文件保护
- `.env` 文件已在 `.gitignore` 中忽略
- `*.sqlite` 数据库文件已忽略
- 不将敏感信息提交到版本控制

#### 错误信息保护
- 生产环境隐藏详细错误信息
- 开发环境显示完整错误堆栈
- 避免 SQL 注入、XSS 等信息泄露

## ⚠️ 部署前必做事项

### 1. 生成强 JWT 密钥
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```
将生成的值设置到 `.env` 的 `JWT_SECRET` 字段。

### 2. 更改默认管理员密码
在 `.env` 中设置强随机密码到 `DEFAULT_ADMIN_PASSWORD`。
首次登录后建议立即修改。

### 3. 配置 CORS 白名单
在 `.env` 中设置 `ALLOWED_ORIGINS` 为实际使用的域名。

### 4. 撤销泄露的 API 密钥
如果 `.env` 中的 API 密钥已泄露：
1. 登录相应的 AI 平台（豆包、DeepSeek 等）
2. 撤销旧的 API 密钥
3. 生成新的 API 密钥
4. 更新 `.env` 文件
5. 重启应用

## 🔍 安全检查清单

部署前请确认：

- [ ] JWT_SECRET 已设置为强随机值（至少32字符）
- [ ] DEFAULT_ADMIN_PASSWORD 已更改
- [ ] ALLOWED_ORIGINS 已配置为实际域名
- [ ] 所有 API 密钥已检查并更新
- [ ] HTTPS 已启用（生产环境）
- [ ] .env 文件不在 Git 仓库中
- [ ] database.sqlite 不在 Git 仓库中
- [ ] 防火墙已正确配置
- [ ] 定期备份已设置

## 📊 安全测试

### 认证测试
```bash
# 未登录访问应返回 401
curl http://localhost:3002/api/detection/history/1

# 使用 token 访问应成功
curl -H "Authorization: Bearer <token>" http://localhost:3002/api/detection/history/1
```

### 授权测试
```bash
# 用户A尝试访问用户B数据应返回 403
curl -H "Authorization: Bearer <userA_token>" http://localhost:3002/api/detection/history/2
```

### 速率限制测试
```bash
# 快速发送多个请求，应触发 429
for i in {1..550}; do curl -H "Authorization: Bearer <token>" http://localhost:3002/api/platforms/ping; done
```

### CORS 测试
```bash
# 从非白名单域名访问应被拒绝
curl -H "Origin: https://evil.com" http://localhost:3002/api/health
```

## 🛡️ 安全最佳实践

1. **定期更新依赖**：`npm audit fix`
2. **使用 HTTPS**：生产环境必须启用
3. **配置 WAF**：推荐 Cloudflare、AWS WAF
4. **定期备份**：数据库和配置文件
5. **监控日志**：关注异常访问模式
6. **最小权限原则**：仅授予必要的权限
7. **定期审查**：定期审查安全配置和访问日志

## 📞 安全问题报告

如发现安全漏洞，请及时联系维护团队或提交 Issue。

**不要公开披露未修复的安全漏洞。**

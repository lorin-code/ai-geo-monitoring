# 接口文档

> 统一前缀：`/api`
> **重要**：除了健康检查、验证码、公共 SEO 和公共通知接口外，其他业务接口都需要身份验证。

## 认证说明

> ⚠️ **除明确标注为公开的接口外，所有接口都需要在请求头中携带有效的 JWT Token**

### 请求头格式
```
Authorization: Bearer <token>
```

### 认证相关响应
- `401 Unauthorized` - 未提供 token 或 token 无效
- `403 Forbidden` - 无权限访问该资源（如访问他人数据）
- `429 Too Many Requests` - 超过速率限制

### 速率限制
- **通用 API**：500 次/15 分钟
- **定时任务 API**：1000 次/15 分钟
- **登录接口**：5 次/15 分钟

## 健康检查
- `GET /api/health`

## 验证码（公开接口，无需认证）
- `GET /api/captcha/new` 获取文本验证码（题目与有效期）
- `GET /api/captcha/image` 获取图形验证码（SVG 与有效期）

## 用户
- `POST /api/users/register` 注册（公开）
  - 参数：`username`、`email`、`password`、`captcha_id`、`captcha_answer`
- `POST /api/users/login` 登录（公开，有速率限制）
  - 返回：`token` 与用户信息
- `GET /api/users/profile/:userId` 获取用户信息（需登录）
  - **权限验证**：只能查看自己的信息，管理员可查看所有
- `PUT /api/users/profile/:userId` 更新用户邮箱（需登录）
  - **权限验证**：只能修改自己的信息，管理员可修改所有
- `GET /api/users/quota/:userId` 获取会员等级与配额摘要（需登录）
  - **权限验证**：只能查看自己的配额
- 管理员接口（需管理员权限）：
  - `GET /api/users` 用户列表（分页与搜索）
  - `POST /api/users` 创建用户
  - `PUT /api/users/:id` 更新用户状态/角色/会员
  - `DELETE /api/users/:id` 删除用户
  - `PUT /api/users/:id/password` 重置用户密码

## AI 检测（需认证）
- `GET /api/detection/brands` 获取品牌列表
- `POST /api/detection/create` 创建检测任务
  - 参数：`question` 必填；`platforms`、`brand`、`brand_keywords`/`highlightKeywords` 可选
- `GET /api/detection/status/:recordId` 获取任务状态与结果摘要
- `GET /api/detection/stream` 流式获取AI结果（SSE）
  - 参数：`platform`、`question`、`brand`、`brand_keywords`
  - SSE 可通过查询参数 `token` 传递 JWT
- `GET /api/detection/history` 获取所有用户检测历史（管理员）
  - 参数：`page`、`limit`、`user_id`、`platform`、`status`、`q`、`brand`
- `GET /api/detection/history/:userId` 获取检测历史
  - 参数：`page`、`limit`、`platform`、`status`、`q`、`brand`
  - **权限验证**：只能查看自己的历史，管理员可查看所有
- `DELETE /api/detection/record/:id` 删除单条历史记录
  - **权限验证**：只能删除自己的记录，管理员可删除所有
- `DELETE /api/detection/history/:userId` 批量删除历史记录
  - **权限验证**：只能删除自己的记录，管理员可删除所有

## 定时任务（需认证）
- `POST /api/schedules` 创建每日定时任务
  - 参数：`question`、`platforms`、`daily_time`、`timezone`、`brand`、`brand_keywords`
- `GET /api/schedules` 列出当前用户定时任务
- `PUT /api/schedules/:id` 更新定时任务
  - **权限验证**：只能操作自己的任务
- `DELETE /api/schedules/:id` 删除定时任务
  - **权限验证**：只能删除自己的任务
- `POST /api/schedules/:id/run` 立即执行一次
  - **权限验证**：只能执行自己的任务

## 平台自检（需认证）
- `GET /api/platforms/ping` 检查各平台 API Key 配置状态

## 会员方案（需管理员权限）
- `GET /api/membership/plans` 获取全部会员方案
- `PUT /api/membership/plans/:level` 更新指定会员方案
- `POST /api/membership/plans/resetAll` 批量重置为默认值
- `POST /api/membership/plans/:level/reset` 重置指定等级为默认值

## 设置
- 管理员接口（需管理员权限）：
  - `GET /api/settings` 获取允许的系统设置项
  - `PUT /api/settings` 更新设置
- 公开接口（无需认证）：
  - `GET /api/settings/seo` 获取公共 SEO 设置
  - `GET /api/settings/notice` 获取系统通知

## 统计（需认证）
- 管理员接口（需管理员权限）：
  - `GET /api/statistics/overview` 管理员概览统计
- 用户接口（需认证）：
  - `GET /api/statistics/user/:userId` 用户维度统计
    - **权限验证**：只能查看自己的统计
  - `GET /api/statistics/keywords/:userId` 品牌关键词统计
    - **权限验证**：只能查看自己的统计
  - `GET /api/statistics/platform-comparison/:userId` 平台对比统计
    - **权限验证**：只能查看自己的统计
  - `GET /api/statistics/trends/:userId` 趋势分析
    - 参数：`days` 可选，默认 30
    - **权限验证**：只能查看自己的统计

## 响应状态码
- `200 OK` - 请求成功
- `400 Bad Request` - 请求参数错误
- `401 Unauthorized` - 未认证或 token 无效
- `403 Forbidden` - 无权限访问该资源
- `404 Not Found` - 资源不存在
- `429 Too Many Requests` - 超过速率限制
- `500 Internal Server Error` - 服务器内部错误

## 响应格式
成功响应：
```json
{
  "success": true,
  "data": { ... },
  "message": "操作成功"
}
```

错误响应：
```json
{
  "success": false,
  "message": "错误描述"
}
```

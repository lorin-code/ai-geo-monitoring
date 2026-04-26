const jwt = require('jsonwebtoken');

function extractToken(req) {
  const authHeader = req.headers['authorization'] || '';
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  // 兼容 SSE：从查询参数读取 token
  if (req.query && req.query.token) {
    return String(req.query.token);
  }
  // 兼容 Cookie（可选）
  if (req.cookies && req.cookies.token) {
    return String(req.cookies.token);
  }
  return null;
}

module.exports = {
  // 普通鉴权：要求有效 JWT
  authRequired: (req, res, next) => {
    try {
      const token = extractToken(req);
      if (!token) {
        return res.status(401).json({ success: false, message: '未授权：缺少令牌' });
      }
      const secret = process.env.JWT_SECRET;
      if (!secret) {
        console.error('JWT_SECRET not configured');
        return res.status(500).json({ success: false, message: '服务器配置错误' });
      }
      const payload = jwt.verify(token, secret);
      req.user = { id: payload.userId, username: payload.username, role: payload.role };
      return next();
    } catch (error) {
      return res.status(401).json({ success: false, message: '未授权：令牌无效或已过期' });
    }
  },

  // 管理员鉴权：要求 role === 'admin'
  adminRequired: (req, res, next) => {
    try {
      const token = extractToken(req);
      if (!token) {
        return res.status(401).json({ success: false, message: '未授权：缺少令牌' });
      }
      const secret = process.env.JWT_SECRET;
      if (!secret) {
        console.error('JWT_SECRET not configured');
        return res.status(500).json({ success: false, message: '服务器配置错误' });
      }
      const payload = jwt.verify(token, secret);
      req.user = { id: payload.userId, username: payload.username, role: payload.role };
      if (req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: '禁止访问：需要管理员权限' });
      }
      return next();
    } catch (error) {
      return res.status(401).json({ success: false, message: '未授权：令牌无效或已过期' });
    }
  }
};
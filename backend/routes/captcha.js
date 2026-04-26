const express = require('express');
const router = express.Router();
const CaptchaService = require('../services/CaptchaService');

const captchaAttempts = new Map();
function captchaLimiter(req, res, next) {
  const ip = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const now = Date.now();
  const windowMs = 5 * 60 * 1000;
  const limit = 30;
  const list = captchaAttempts.get(ip) || [];
  const recent = list.filter(ts => now - ts < windowMs);
  if (recent.length >= limit) {
    return res.status(429).json({ success: false, message: '请求过于频繁，请稍后再试' });
  }
  recent.push(now);
  captchaAttempts.set(ip, recent);
  next();
}

// 获取新的验证码（公开接口，无需鉴权）
router.get('/new', captchaLimiter, async (req, res) => {
  try {
    const { id, question, ttlMs } = CaptchaService.createChallenge();
    return res.json({ success: true, data: { id, question, expires_in: Math.floor(ttlMs / 1000) } });
  } catch (error) {
    console.error('生成验证码失败:', error);
    return res.status(500).json({ success: false, message: '生成验证码失败', error: error.message });
  }
});

// 获取图形验证码（SVG，公开接口，无需鉴权）
router.get('/image', captchaLimiter, async (req, res) => {
  try {
    const { id, svg, ttlMs } = CaptchaService.createSvgChallenge();
    return res.json({ success: true, data: { id, svg, expires_in: Math.floor(ttlMs / 1000) } });
  } catch (error) {
    console.error('生成图形验证码失败:', error);
    return res.status(500).json({ success: false, message: '生成图形验证码失败', error: error.message });
  }
});

module.exports = router;
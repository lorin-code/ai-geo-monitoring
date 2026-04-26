const express = require('express');
const router = express.Router();
const AIPlatformService = require('../services/AIPlatformService');
const { authRequired } = require('../middleware/auth');

// 平台连通性自检（轻量：仅检查是否配置密钥）- 需要登录
router.get('/ping', authRequired, async (req, res) => {
  try {
    const platforms = AIPlatformService.platforms || {};
    const result = Object.keys(platforms).map((key) => {
      const cfg = platforms[key] || {};
      const ok = Boolean(cfg.apiKey);
      return {
        platform: key,
        name: cfg.name || key,
        ok,
        message: ok ? 'API密钥已配置' : 'API密钥未配置'
      };
    });

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: '平台自检失败', error: error.message });
  }
});

module.exports = router;
const express = require('express');
const router = express.Router();
const AIPlatformService = require('../services/AIPlatformService');
const PlatformSelectionService = require('../services/PlatformSelectionService');
const { authRequired } = require('../middleware/auth');

// 平台连通性自检（轻量：仅检查是否配置密钥）- 需要登录
router.get('/ping', authRequired, async (req, res) => {
  try {
    const result = PlatformSelectionService.buildSupportedStatus(AIPlatformService.platforms || {});

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('平台自检失败:', error);
    res.status(500).json({ success: false, message: '平台自检失败' });
  }
});

module.exports = router;

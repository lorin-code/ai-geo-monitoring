const express = require('express');
const BrandRankingService = require('../services/BrandRankingService');
const router = express.Router();

router.get('/options', async (req, res) => {
  try {
    res.json({ success: true, data: await BrandRankingService.getOptions({ user: req.user }) });
  } catch {
    res.status(500).json({ success: false, message: '获取可排名品牌失败' });
  }
});

router.post('/calculate', async (req, res) => {
  try {
    const data = await BrandRankingService.calculate({ user: req.user, input: req.body });
    res.json({ success: true, data });
  } catch (error) {
    const status = [400, 404].includes(error.status) ? error.status : 500;
    res.status(status).json({ success: false, message: status === 500 ? '计算品牌排名失败，请稍后重试' : error.message });
  }
});

module.exports = router;

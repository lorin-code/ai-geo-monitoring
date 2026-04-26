const express = require('express');
const router = express.Router();
const { MembershipPlan } = require('../models');
const { adminRequired } = require('../middleware/auth');

// 获取全部会员方案
router.get('/plans', adminRequired, async (req, res) => {
  try {
    const plans = await MembershipPlan.findAll();
    res.json({ success: true, data: plans });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取会员方案失败', error: error.message });
  }
});

// 更新指定会员方案（按等级）
router.put('/plans/:level', adminRequired, async (req, res) => {
  try {
    const { level } = req.params;
    const { detection_daily_limit } = req.body;
    const plan = await MembershipPlan.findOne({ where: { level } });
    if (!plan) return res.status(404).json({ success: false, message: '会员方案不存在' });
    const payload = {};
    if (typeof detection_daily_limit === 'number') payload.detection_daily_limit = detection_daily_limit;
    await plan.update(payload);
    res.json({ success: true, message: '会员方案已更新' });
  } catch (error) {
    res.status(500).json({ success: false, message: '更新会员方案失败', error: error.message });
  }
});

// 批量重置全部会员方案为默认值
router.post('/plans/resetAll', adminRequired, async (req, res) => {
  try {
    const DEFAULTS = {
      free: { detection_daily_limit: 10 },
      pro: { detection_daily_limit: 100 },
      enterprise: { detection_daily_limit: 1000 }
    };
    const levels = Object.keys(DEFAULTS);
    for (const level of levels) {
      const plan = await MembershipPlan.findOne({ where: { level } });
      if (plan) {
        await plan.update(DEFAULTS[level]);
      }
    }
    res.json({ success: true, message: '全部会员方案已重置为默认值' });
  } catch (error) {
    res.status(500).json({ success: false, message: '批量重置失败', error: error.message });
  }
});

// 重置指定会员方案为默认值
router.post('/plans/:level/reset', adminRequired, async (req, res) => {
  try {
    const { level } = req.params;
    const DEFAULTS = {
      free: { detection_daily_limit: 10 },
      pro: { detection_daily_limit: 100 },
      enterprise: { detection_daily_limit: 1000 }
    };
    if (!DEFAULTS[level]) {
      return res.status(400).json({ success: false, message: '非法会员等级' });
    }
    const plan = await MembershipPlan.findOne({ where: { level } });
    if (!plan) return res.status(404).json({ success: false, message: '会员方案不存在' });
    await plan.update(DEFAULTS[level]);
    res.json({ success: true, message: '已重置为默认方案' });
  } catch (error) {
    res.status(500).json({ success: false, message: '重置默认方案失败', error: error.message });
  }
});

module.exports = router;
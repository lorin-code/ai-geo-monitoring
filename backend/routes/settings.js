const express = require('express');
const router = express.Router();
const { Setting } = require('../models');
const { adminRequired } = require('../middleware/auth');

// 允许的设置项及校验
const allowedKeys = {
  default_membership_level: (val) => ['free', 'pro', 'enterprise'].includes(String(val)),
  quota_low_threshold: (val) => {
    const num = Number(val);
    return !isNaN(num) && num >= 0 && num <= 1;
  },
  // 系统通知文本，允许空字符串，长度限制防止过长
  system_notice: (val) => {
    const s = String(val ?? '');
    return s.length <= 5000;
  },
  // SEO 设置
  seo_title: (val) => {
    const s = String(val ?? '');
    return s.length >= 0 && s.length <= 255;
  },
  seo_description: (val) => {
    const s = String(val ?? '');
    return s.length <= 1000; // 适度限制长度
  },
  seo_keywords: (val) => {
    const s = String(val ?? '');
    return s.length <= 1000;
  },
  seo_robots: (val) => ['index,follow','index,nofollow','noindex,follow','noindex,nofollow'].includes(String(val || 'index,follow'))
};

// 获取所有设置（仅返回允许的键）
router.get('/', adminRequired, async (req, res) => {
  try {
    const rows = await Setting.findAll();
    const map = {};
    for (const row of rows) {
      const key = row.key;
      if (allowedKeys[key]) {
        map[key] = row.value;
      }
    }
    // 默认值兜底
    if (!('default_membership_level' in map)) map.default_membership_level = 'free';
    if (!('quota_low_threshold' in map)) map.quota_low_threshold = '0.2';
    if (!('system_notice' in map)) map.system_notice = '';
    if (!('seo_title' in map)) map.seo_title = '';
    if (!('seo_description' in map)) map.seo_description = '';
    if (!('seo_keywords' in map)) map.seo_keywords = '';
    if (!('seo_robots' in map)) map.seo_robots = 'index,follow';
    res.json({ success: true, data: map });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取设置失败', error: error.message });
  }
});

// 更新设置（仅允许指定键）
router.put('/', adminRequired, async (req, res) => {
  try {
    const payload = req.body || {};
    const updates = {};
    for (const key of Object.keys(allowedKeys)) {
      if (key in payload) {
        const val = payload[key];
        if (!allowedKeys[key](val)) {
          return res.status(400).json({ success: false, message: `非法设置值: ${key}` });
        }
        updates[key] = String(val);
      }
    }
    const entries = Object.entries(updates);
    for (const [key, value] of entries) {
      const existing = await Setting.findOne({ where: { key } });
      if (existing) await existing.update({ value });
      else await Setting.create({ key, value });
    }
    res.json({ success: true, message: '设置已更新' });
  } catch (error) {
    res.status(500).json({ success: false, message: '更新设置失败', error: error.message });
  }
});

// 公共SEO设置（无需鉴权）
router.get('/seo', async (req, res) => {
  try {
    const keys = ['seo_title','seo_description','seo_keywords','seo_robots'];
    const rows = await Setting.findAll({ where: { key: keys } });
    const map = {};
    for (const row of rows) {
      map[row.key] = row.value;
    }
    if (!('seo_title' in map)) map.seo_title = '';
    if (!('seo_description' in map)) map.seo_description = '';
    if (!('seo_keywords' in map)) map.seo_keywords = '';
    if (!('seo_robots' in map)) map.seo_robots = 'index,follow';
    res.json({ success: true, data: map });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取SEO设置失败', error: error.message });
  }
});

// 普通用户获取系统通知（仅返回通知文本与更新时间）
router.get('/notice', async (req, res) => {
  try {
    const row = await Setting.findOne({ where: { key: 'system_notice' } });
    res.json({
      success: true,
      data: {
        notice: row?.value || '',
        updated_at: row?.updated_at || null
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取系统通知失败', error: error.message });
  }
});

module.exports = router;
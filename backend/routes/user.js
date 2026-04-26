const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { User, MembershipPlan, UsageCounter, Setting } = require('../models');
const { Op } = require('sequelize');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { adminRequired, authRequired } = require('../middleware/auth');
const CaptchaService = require('../services/CaptchaService');

// 登录速率限制
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: '登录尝试过多，请15分钟后再试'
});

// 用户注册
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, captcha_id, captcha_answer } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: '请提供完整的注册信息'
      });
    }

    // 验证码校验（必填）
    if (!captcha_id || !captcha_answer) {
      return res.status(400).json({ success: false, message: '请完成验证码校验' });
    }
    const v = CaptchaService.verify(captcha_id, captcha_answer);
    if (!v.ok) {
      const msg = v.reason === 'expired' ? '验证码已过期，请刷新' : '验证码错误';
      return res.status(400).json({ success: false, message: msg });
    }

    // 检查用户是否已存在
    const existingUser = await User.findOne({
      where: {
        [Op.or]: [{ username }, { email }]
      }
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: '用户名或邮箱已存在'
      });
    }

    // 加密密码
    const hashedPassword = await bcrypt.hash(password, 10);

    // 创建用户
    const user = await User.create({
      username,
      email,
      password: hashedPassword
    });

    res.json({
      success: true,
      message: '用户注册成功',
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        created_at: user.created_at
      }
    });

  } catch (error) {
    console.error('用户注册失败:', error);
    res.status(500).json({
      success: false,
      message: '用户注册失败',
      error: error.message
    });
  }
});

// 用户登录
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: '请提供用户名和密码'
      });
    }

    // 查找用户
    const user = await User.findOne({
      where: {
        [Op.or]: [{ username }, { email: username }]
      }
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: '用户名或密码错误'
      });
    }

    // 验证密码
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: '用户名或密码错误'
      });
    }

    // 检查用户状态
    if (user.status !== 'active') {
      return res.status(401).json({
        success: false,
        message: '账户已被禁用，请联系管理员'
      });
    }

    // 更新最后登录时间
    await user.update({ last_login: new Date() });

    // 生成JWT token
    const token = jwt.sign(
      { 
        userId: user.id, 
        username: user.username,
        role: user.role 
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      message: '登录成功',
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          last_login: user.last_login
        }
      }
    });

  } catch (error) {
    console.error('用户登录失败:', error);
    res.status(500).json({
      success: false,
      message: '用户登录失败',
      error: error.message
    });
  }
});

// 获取用户信息
router.get('/profile/:userId', authRequired, async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findByPk(userId, {
      attributes: ['id', 'username', 'email', 'role', 'status', 'created_at', 'last_login']
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    res.json({
      success: true,
      data: user
    });

  } catch (error) {
    console.error('获取用户信息失败:', error);
    res.status(500).json({
      success: false,
      message: '获取用户信息失败',
      error: error.message
    });
  }
});

// 获取指定用户的会员等级与配额摘要
router.get('/quota/:userId', authRequired, async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findByPk(userId, {
      attributes: ['id', 'username', 'email', 'role', 'status', 'membership_level', 'membership_expires_at']
    });
    if (!user) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }

    const now = new Date();
    const startOfPeriod = (date, period) => {
      const d = new Date(date);
      if (period === 'daily') { d.setHours(0, 0, 0, 0); }
      else if (period === 'monthly') { d.setDate(1); d.setHours(0, 0, 0, 0); }
      return d;
    };

    const counters = await UsageCounter.findAll({ where: { user_id: user.id } });
    const level = user.membership_level || 'free';
    const plan = await MembershipPlan.findOne({ where: { level } });

    const findCounter = (feature, period) => {
      const c = counters.find(c => c.feature === feature && c.period === period);
      if (!c) return { used_count: 0, period_start: startOfPeriod(now, period) };
      const start = startOfPeriod(now, period);
      const cStart = startOfPeriod(c.period_start, period);
      const used = (cStart.getTime() === start.getTime()) ? c.used_count : 0;
      return { used_count: used };
    };

    const detection = findCounter('detection', 'daily');
    

    const limits = {
      detection: plan?.detection_daily_limit || 0
    };

    const quota_summary = {
      detection: { used: detection.used_count, limit: limits.detection, remaining: Math.max(0, (limits.detection || 0) - (detection.used_count || 0)) }
    };

    res.json({ success: true, data: { user_id: user.id, membership_level: level, membership_expires_at: user.membership_expires_at, quota_summary } });
  } catch (error) {
    console.error('获取用户配额失败:', error);
    res.status(500).json({ success: false, message: '获取用户配额失败', error: error.message });
  }
});

// 更新用户信息
router.put('/profile/:userId', authRequired, async (req, res) => {
  try {
    const { userId } = req.params;
    // 权限验证：管理员或本人可修改
    if (req.user.role !== 'admin' && req.user.id !== parseInt(userId)) {
      return res.status(403).json({ success: false, message: '无权修改' });
    }
    const { email } = req.body;

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: '用户不存在'
      });
    }

    // 检查邮箱是否已被使用
    if (email && email !== user.email) {
      const existingUser = await User.findOne({
        where: { email }
      });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: '邮箱已被使用'
        });
      }
    }

    await user.update({ email });

    res.json({
      success: true,
      message: '用户信息更新成功',
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });

  } catch (error) {
    console.error('更新用户信息失败:', error);
    res.status(500).json({
      success: false,
      message: '更新用户信息失败',
      error: error.message
    });
  }
});

// 管理员：用户列表
router.get('/', adminRequired, async (req, res) => {
  try {
    const { page = 1, limit = 20, q = '' } = req.query;
    const where = q
      ? {
          [Op.or]: [
            { username: { [Op.like]: `%${q}%` } },
            { email: { [Op.like]: `%${q}%` } }
          ]
        }
      : {};
    const offset = (Number(page) - 1) * Number(limit);
    const { rows, count } = await User.findAndCountAll({
      where,
      offset,
      limit: Number(limit),
      order: [['created_at', 'DESC']],
      attributes: ['id', 'username', 'email', 'role', 'status', 'membership_level', 'membership_expires_at', 'created_at', 'last_login']
    });
    // 计算当前周期的配额使用情况
    const now = new Date();
    const startOfPeriod = (date, period) => {
      const d = new Date(date);
      if (period === 'daily') { d.setHours(0,0,0,0); }
      else if (period === 'monthly') { d.setDate(1); d.setHours(0,0,0,0); }
      return d;
    };

    const userIds = rows.map(u => u.id);
    const counters = await UsageCounter.findAll({ where: { user_id: userIds } });

    // 查询各用户对应方案
    const levels = Array.from(new Set(rows.map(u => u.membership_level || 'free')));
    const plans = await MembershipPlan.findAll({ where: { level: levels } });
    const planMap = new Map(plans.map(p => [p.level, p]));

    const result = rows.map(u => {
      const level = u.membership_level || 'free';
      const plan = planMap.get(level);
      const findCounter = (feature, period) => {
        const c = counters.find(c => c.user_id === u.id && c.feature === feature && c.period === period);
        if (!c) return { used_count: 0, period_start: startOfPeriod(now, period) };
        const start = startOfPeriod(now, period);
        const cStart = startOfPeriod(c.period_start, period);
        const used = (cStart.getTime() === start.getTime()) ? c.used_count : 0;
        return { used_count: used };
      };
      const detection = findCounter('detection', 'daily');
      
      const limits = {
        detection: plan?.detection_daily_limit || 0
      };
      const quota_summary = {
        detection: { used: detection.used_count, limit: limits.detection, remaining: Math.max(0, (limits.detection || 0) - (detection.used_count || 0)) }
      };
      const plain = u.toJSON();
      return { ...plain, quota_summary };
    });

    res.json({ success: true, data: { users: result, total: count } });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取用户列表失败', error: error.message });
  }
});

// 管理员：创建用户
router.post('/', adminRequired, async (req, res) => {
  try {
    const { username, email, password, role = 'user', membership_level, membership_duration_days } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: '用户名与密码必填' });
    }
    const exists = await User.findOne({ where: { [Op.or]: [{ username }, { email }] } });
    if (exists) {
      return res.status(400).json({ success: false, message: '用户名或邮箱已存在' });
    }
    const hash = await bcrypt.hash(password, 10);
    // 简单校验等级
    const allowedLevels = ['free', 'pro', 'enterprise'];
    // 支持通过环境变量配置默认会员等级
    // 优先读取设置表的默认等级，其次使用环境变量，最后兜底为 free
    let settingsDefault = null;
    try {
      const s = await Setting.findOne({ where: { key: 'default_membership_level' } });
      if (s && allowedLevels.includes(String(s.value))) settingsDefault = String(s.value);
    } catch (e) {}
    const configuredDefault = process.env.DEFAULT_MEMBERSHIP_LEVEL || 'free';
    const defaultLevel = settingsDefault || (allowedLevels.includes(String(configuredDefault)) ? configuredDefault : 'free');
    const requestedLevel = membership_level ? String(membership_level) : null;
    const level = requestedLevel && allowedLevels.includes(requestedLevel) ? requestedLevel : defaultLevel;
    let membership_expires_at = null;
    const days = Number(membership_duration_days);
    if (level !== 'free') {
      if (!isNaN(days) && days > 0) {
        membership_expires_at = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
      }
    } else {
      // 免费用户长期有效：清空到期时间
      membership_expires_at = null;
    }
    const user = await User.create({ username, email, password: hash, role, membership_level: level, membership_expires_at, status: 'active' });
    res.json({ success: true, message: '用户创建成功', data: { id: user.id } });
  } catch (error) {
    res.status(500).json({ success: false, message: '创建用户失败', error: error.message });
  }
});

// 管理员：更新用户状态/角色
router.put('/:id', adminRequired, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, role, membership_level, membership_expires_at, membership_duration_days } = req.body;
    const user = await User.findByPk(id);
    if (!user) return res.status(404).json({ success: false, message: '用户不存在' });
    const payload = {};
    if (status) payload.status = status;
    if (role) payload.role = role;
    if (membership_level) payload.membership_level = membership_level;
    // 计算最终等级（若本次未传则沿用当前用户等级）
    const finalLevel = payload.membership_level || user.membership_level || 'free';
    if (finalLevel === 'free') {
      // 免费用户长期有效：清空到期时间
      payload.membership_expires_at = null;
    } else {
      // 支持直接设置到期时间或按时长设置到期（从当前时间起）
      if (membership_expires_at) {
        const d = new Date(membership_expires_at);
        if (!isNaN(d.getTime())) payload.membership_expires_at = d;
      }
      const days = Number(membership_duration_days);
      if (!isNaN(days) && days > 0) {
        payload.membership_expires_at = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
      }
    }
    await user.update(payload);
    res.json({ success: true, message: '用户更新成功' });
  } catch (error) {
    res.status(500).json({ success: false, message: '更新用户失败', error: error.message });
  }
});

// 管理员：删除用户
router.delete('/:id', adminRequired, async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findByPk(id);
    if (!user) return res.status(404).json({ success: false, message: '用户不存在' });
    await user.destroy();
    res.json({ success: true, message: '用户已删除' });
  } catch (error) {
    res.status(500).json({ success: false, message: '删除用户失败', error: error.message });
  }
});

// 管理员：重置用户密码
router.put('/:id/password', adminRequired, async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;
    if (!password || String(password).length < 6) {
      return res.status(400).json({ success: false, message: '新密码至少6位' });
    }
    const user = await User.findByPk(id);
    if (!user) return res.status(404).json({ success: false, message: '用户不存在' });
    const hash = await bcrypt.hash(password, 10);
    await user.update({ password: hash });
    res.json({ success: true, message: '密码已重置' });
  } catch (error) {
    res.status(500).json({ success: false, message: '重置密码失败', error: error.message });
  }
});

module.exports = router;
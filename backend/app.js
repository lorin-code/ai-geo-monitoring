const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();
const bcrypt = require('bcryptjs');

const app = express();

// 中间件
// CORS 配置白名单
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:5173', 'http://localhost:3000'];

app.use(cors({
  origin: function(origin, callback) {
    // 允许没有 origin 的请求（如移动应用、服务器间调用）
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('不允许的跨域请求'));
    }
  },
  credentials: true
}));

// 安全头
app.use(helmet({
  contentSecurityPolicy: false // 前端使用内联样式
}));

// 公开接口白名单（不需要速率限制）
// 注意：req.path 在挂载到 /api/ 后，不包含 /api 前缀
const publicPaths = [
  '/health',
  '/captcha',
  '/settings/seo',
  '/settings/notice'
];

// 通用速率限制（排除公开接口）
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 500, // 限制500次请求
  message: '请求过于频繁，请稍后再试',
  skip: (req) => {
    // 跳过公开接口的速率限制
    const path = req.path || req.url || '';
    return publicPaths.some(p => path.startsWith(p));
  }
});

// schedules端点专用速率限制（更高限制）
const scheduleLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 1000, // 限制1000次请求
  message: '定时任务接口请求过于频繁，请稍后再试'
});

app.use('/api/', limiter);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// 数据库连接与模型
const { sequelize, User, MembershipPlan, Setting } = require('./models');
const { DataTypes } = require('sequelize');

// 路由
const detectionRoutes = require('./routes/detection');
const userRoutes = require('./routes/user');
const statisticsRoutes = require('./routes/statistics');
const platformsRoutes = require('./routes/platforms');
const membershipRoutes = require('./routes/membership');
const settingsRoutes = require('./routes/settings');
const captchaRoutes = require('./routes/captcha');
const scheduleRoutes = require('./routes/schedules');
const SchedulerService = require('./services/SchedulerService');
const { authRequired } = require('./middleware/auth');

// 用户登录与公开用户接口保持在 /api/users 下（登录无需鉴权）
app.use('/api/users', userRoutes);
// 公开验证码接口（注册用）
app.use('/api/captcha', captchaRoutes);
// 需要登录的接口：检测、统计、平台自检
app.use('/api/detection', authRequired, detectionRoutes);
app.use('/api/statistics', authRequired, statisticsRoutes);
app.use('/api/platforms', authRequired, platformsRoutes);
app.use('/api/membership', authRequired, membershipRoutes);
// 定时任务接口（需要登录）
app.use('/api/schedules', scheduleLimiter, authRequired, scheduleRoutes);
// 设置路由：内部已对管理接口使用 adminRequired；公开接口（如 /seo、/notice）无需统一鉴权
app.use('/api/settings', settingsRoutes);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// 错误处理中间件
app.use((err, req, res, next) => {
  console.error(err.stack);
  const isDev = process.env.NODE_ENV === 'development';

  res.status(err.status || 500).json({
    success: false,
    message: isDev ? err.message : '请求处理失败',
    ...(isDev && { stack: err.stack })
  });
});

// 404处理
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: '接口不存在'
  });
});

const PORT = process.env.PORT || 3000;

// 数据库同步并启动服务器
// 确保存在演示用户（不占用 id=1），并修复明文密码
async function ensureDefaultUser() {
  try {
    const existing = await User.findOne({ where: { username: 'demo' } });
    if (!existing) {
      const hashed = await bcrypt.hash('demo-password', 10);
      const user = await User.create({
        username: 'demo',
        email: 'demo@example.com',
        password: hashed,
        role: 'user',
        status: 'active'
      });
      console.log(`已创建演示用户: id=${user.id}, username=demo`);
    } else {
      // 若历史上使用了明文密码，进行修复（bcrypt 哈希以 $2 开头）
      const isHashed = typeof existing.password === 'string' && existing.password.startsWith('$2');
      if (!isHashed) {
        const hashed = await bcrypt.hash('demo-password', 10);
        await existing.update({ password: hashed });
        console.log('已修复演示用户密码为安全哈希');
      }
    }
  } catch (e) {
    console.warn('创建/修复演示用户失败:', e.message);
  }
}

// 确保存在管理员账户且 id=1 为管理员；必要时创建或提升
async function ensureDefaultAdmin() {
  try {
    const username = process.env.DEFAULT_ADMIN_USERNAME || 'admin';
    const email = process.env.DEFAULT_ADMIN_EMAIL || 'admin@example.com';
    const passwordRaw = process.env.DEFAULT_ADMIN_PASSWORD || 'Admin@123';
    const hashed = await bcrypt.hash(passwordRaw, 10);

    const user1 = await User.findByPk(1);
    if (!user1) {
      // 不存在 id=1，则创建管理员占用 id=1
      const admin = await User.create({
        id: 1,
        username,
        email,
        password: hashed,
        role: 'admin',
        membership_level: 'enterprise',
        status: 'active'
      });
      console.log('已创建默认管理员: id=1');
      return;
    }

    // 存在 id=1：确保其为管理员，并尽量更新等级/状态
    const updates = {};
    if (user1.role !== 'admin') updates.role = 'admin';
    if (user1.membership_level !== 'enterprise') updates.membership_level = 'enterprise';
    if (user1.status !== 'active') updates.status = 'active';

    // 若需要，尝试更新用户名/邮箱为默认管理员信息（避免唯一冲突）
    try {
      const otherWithUsername = await User.findOne({ where: { username }, attributes: ['id'] });
      if (!otherWithUsername || otherWithUsername.id === 1) updates.username = username;
      const otherWithEmail = await User.findOne({ where: { email }, attributes: ['id'] });
      if (!otherWithEmail || otherWithEmail.id === 1) updates.email = email;
    } catch (_) { }

    // 若历史上使用了明文密码，进行修复
    const isHashed = typeof user1.password === 'string' && user1.password.startsWith('$2');
    if (!isHashed) updates.password = hashed;

    if (Object.keys(updates).length > 0) {
      await user1.update(updates);
      console.log('已将 id=1 用户设置为管理员并更新必要字段');
    } else {
      console.log('id=1 用户已是管理员');
    }
  } catch (e) {
    console.warn('确保默认管理员失败:', e.message);
  }
}


// 确保存在默认会员配额方案
async function ensureDefaultPlans() {
  try {
    const defaults = [
      { level: 'free', detection_daily_limit: 10 },
      { level: 'pro', detection_daily_limit: 100 },
      { level: 'enterprise', detection_daily_limit: 1000 }
    ];
    for (const plan of defaults) {
      const existing = await MembershipPlan.findOne({ where: { level: plan.level } });
      if (!existing) {
        await MembershipPlan.create(plan);
        console.log(`已创建默认会员方案: ${plan.level}`);
      }
    }
  } catch (e) {
    console.warn('创建默认会员方案失败:', e.message);
  }
}

// 确保存在默认设置项
async function ensureDefaultSettings() {
  try {
    const defaults = [
      { key: 'default_membership_level', value: process.env.DEFAULT_MEMBERSHIP_LEVEL || 'free' },
      { key: 'quota_low_threshold', value: '0.2' },
      { key: 'system_notice', value: '' },
      { key: 'seo_title', value: '' },
      { key: 'seo_description', value: '' },
      { key: 'seo_keywords', value: '' },
      { key: 'seo_robots', value: 'index,follow' }
    ];
    for (const s of defaults) {
      const existing = await Setting.findOne({ where: { key: s.key } });
      if (!existing) {
        await Setting.create(s);
        console.log(`已创建默认设置: ${s.key}=${s.value}`);
      }
    }
  } catch (e) {
    console.warn('创建默认设置失败:', e.message);
  }
}

(async () => {
  try {
    await sequelize.sync();
    // 确保 users 表存在会员到期列
    try {
      const qi = sequelize.getQueryInterface();
      const desc = await qi.describeTable('users');
      if (!desc.membership_expires_at) {
        await qi.addColumn('users', 'membership_expires_at', { type: DataTypes.DATE, allowNull: true });
        console.log('已添加 users.membership_expires_at 列');
      }
    } catch (e) {
      console.warn('检查/添加 users.membership_expires_at 列失败:', e.message);
    }
    console.log('数据库连接成功');
    // 先确保管理员 id=1
    await ensureDefaultAdmin();
    // 再创建演示用户（避免占用 id=1）
    await ensureDefaultUser();
    await ensureDefaultPlans();
    await ensureDefaultSettings();
    // 启动定时调度器
    try {
      await SchedulerService.start();
      console.log('定时调度器已启动');
    } catch (e) {
      console.warn('启动调度器失败:', e.message);
    }
    app.listen(PORT, () => {
      console.log(`服务器运行在端口 ${PORT}`);
      console.log(`健康检查: http://localhost:${PORT}/api/health`);
    });
  } catch (err) {
    console.error('数据库连接失败:', err);
    process.exit(1);
  }
})();

module.exports = app;
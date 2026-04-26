const { MembershipPlan, UsageCounter, User } = require('../models');

function startOfPeriod(date, period) {
  const d = new Date(date);
  if (period === 'daily') {
    d.setHours(0, 0, 0, 0);
  } else if (period === 'monthly') {
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
  }
  return d;
}

async function getLimitForUser(userId, feature) {
  const user = await User.findByPk(userId);
  let level = user?.membership_level || 'free';

  // 验证会员是否过期
  if (level !== 'free' && user?.membership_expires_at) {
    if (new Date(user.membership_expires_at) < new Date()) {
      // 会员已过期，降级为免费用户
      level = 'free';
    }
  }

  const plan = await MembershipPlan.findOne({ where: { level } });
  if (!plan) return 0;
  if (feature === 'detection') return plan.detection_daily_limit;
  return 0;
}

function getPeriodForFeature(feature) {
  if (feature === 'detection') return 'daily';
  return 'daily';
}

// 检查并消耗配额
function checkQuota(feature) {
  return async function (req, res, next) {
    try {
      // 兼容通过鉴权中间件设置的 req.user，以及历史代码中的 req.userId
      const userId = (req.user && req.user.id) || req.userId;
      if (!userId) return res.status(401).json({ success: false, message: '未登录' });
      const period = getPeriodForFeature(feature);
      const limit = await getLimitForUser(userId, feature);
      if (!limit || limit <= 0) {
        return res.status(403).json({ success: false, message: '当前会员等级不允许使用该功能' });
      }

      let counter = await UsageCounter.findOne({ where: { user_id: userId, feature, period } });
      const now = new Date();
      const shouldStart = startOfPeriod(now, period);

      if (!counter) {
        try {
          counter = await UsageCounter.create({ user_id: userId, feature, period, used_count: 0, period_start: shouldStart });
        } catch (e) {
          // 处理并发下的唯一约束冲突：回退查找现有记录
          const isUnique = String(e?.name || '').toLowerCase().includes('unique');
          if (isUnique) {
            counter = await UsageCounter.findOne({ where: { user_id: userId, feature, period } });
          } else {
            throw e;
          }
        }
      } else {
        // 若周期已过，重置计数
        const currentPeriodStart = startOfPeriod(counter.period_start, period);
        if (currentPeriodStart.getTime() !== shouldStart.getTime()) {
          await counter.update({ used_count: 0, period_start: shouldStart });
        }
      }

      // 使用原子操作检查并递增，避免竞态条件
      if (counter.used_count >= limit) {
        const msgMap = {
          detection: '今日可用检测次数已用完'
        };
        return res.status(403).json({ success: false, message: msgMap[feature] || '配额已用完' });
      }

      // 使用 increment 进行原子递增
      await counter.increment('used_count', { by: 1 });
      next();
    } catch (error) {
      console.error('配额检查失败:', error);
      res.status(500).json({ success: false, message: '配额检查失败', error: error.message });
    }
  };
}

module.exports = { checkQuota };

// 批量消耗配额（在路由内部按需调用），例如一次请求创建多个任务
// 返回 true 表示已成功扣减；若失败会直接写入响应并返回 false
async function bulkConsumeQuota(req, res, feature, amount, opts = {}) {
  try {
    const userId = (req.user && req.user.id) || req.userId;
    if (!userId) {
      if (opts.sse) {
        // SSE 错误返回
        if (!res.headersSent) {
          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');
          if (typeof res.flushHeaders === 'function') { try { res.flushHeaders(); } catch (_) {} }
        }
        res.write(`data: ${JSON.stringify({ event: 'error', message: '未登录' })}\n\n`);
        try { res.end(); } catch (_) {}
      } else {
        res.status(401).json({ success: false, message: '未登录' });
      }
      return false;
    }
    const period = getPeriodForFeature(feature);
    const limit = await getLimitForUser(userId, feature);
    if (!limit || limit <= 0) {
      if (opts.sse) {
        if (!res.headersSent) {
          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');
          if (typeof res.flushHeaders === 'function') { try { res.flushHeaders(); } catch (_) {} }
        }
        res.write(`data: ${JSON.stringify({ event: 'error', message: '当前会员等级不允许使用该功能' })}\n\n`);
        try { res.end(); } catch (_) {}
      } else {
        res.status(403).json({ success: false, message: '当前会员等级不允许使用该功能' });
      }
      return false;
    }

    let counter = await UsageCounter.findOne({ where: { user_id: userId, feature, period } });
    const now = new Date();
    const shouldStart = startOfPeriod(now, period);

    if (!counter) {
      try {
        counter = await UsageCounter.create({ user_id: userId, feature, period, used_count: 0, period_start: shouldStart });
      } catch (e) {
        const isUnique = String(e?.name || '').toLowerCase().includes('unique');
        if (isUnique) {
          counter = await UsageCounter.findOne({ where: { user_id: userId, feature, period } });
        } else {
          throw e;
        }
      }
    } else {
      const currentPeriodStart = startOfPeriod(counter.period_start, period);
      if (currentPeriodStart.getTime() !== shouldStart.getTime()) {
        await counter.update({ used_count: 0, period_start: shouldStart });
      }
    }

    // 检查配额是否足够
    const nextCount = (counter.used_count || 0) + Number(amount || 0);
    if (nextCount > limit) {
      const msgMap = {
        detection: '今日可用检测次数不足'
      };
      if (opts.sse) {
        if (!res.headersSent) {
          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');
          if (typeof res.flushHeaders === 'function') { try { res.flushHeaders(); } catch (_) {} }
        }
        res.write(`data: ${JSON.stringify({ event: 'error', message: msgMap[feature] || '配额不足', data: { used: counter.used_count, limit, need: Number(amount || 0) } })}\n\n`);
        try { res.end(); } catch (_) {}
      } else {
        res.status(403).json({ success: false, message: msgMap[feature] || '配额不足', data: { used: counter.used_count, limit, need: Number(amount || 0) } });
      }
      return false;
    }

    // 使用原子操作递增，避免竞态条件
    await counter.increment('used_count', { by: Number(amount || 0) });
    return true;
  } catch (error) {
    console.error('批量配额消耗失败:', error);
    if (opts.sse) {
      if (!res.headersSent) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        if (typeof res.flushHeaders === 'function') { try { res.flushHeaders(); } catch (_) {} }
      }
      res.write(`data: ${JSON.stringify({ event: 'error', message: '配额检查失败', error: error.message })}\n\n`);
      try { res.end(); } catch (_) {}
    } else {
      res.status(500).json({ success: false, message: '配额检查失败', error: error.message });
    }
    return false;
  }
}

module.exports.bulkConsumeQuota = bulkConsumeQuota;

// 非路由场景下的直接配额消耗（供定时任务使用）
// 返回 { ok: boolean, used: number, limit: number, reason?: string }
async function consumeQuotaDirect(userId, feature, amount) {
  try {
    const period = getPeriodForFeature(feature);
    const limit = await getLimitForUser(userId, feature);
    if (!limit || limit <= 0) {
      return { ok: false, used: 0, limit, reason: 'not_allowed' };
    }

    let counter = await UsageCounter.findOne({ where: { user_id: userId, feature, period } });
    const now = new Date();
    const shouldStart = startOfPeriod(now, period);

    if (!counter) {
      try {
        counter = await UsageCounter.create({ user_id: userId, feature, period, used_count: 0, period_start: shouldStart });
      } catch (e) {
        const isUnique = String(e?.name || '').toLowerCase().includes('unique');
        if (isUnique) {
          counter = await UsageCounter.findOne({ where: { user_id: userId, feature, period } });
        } else {
          throw e;
        }
      }
    } else {
      const currentPeriodStart = startOfPeriod(counter.period_start, period);
      if (currentPeriodStart.getTime() !== shouldStart.getTime()) {
        await counter.update({ used_count: 0, period_start: shouldStart });
      }
    }

    const nextCount = (counter.used_count || 0) + Number(amount || 0);
    if (nextCount > limit) {
      return { ok: false, used: counter.used_count || 0, limit, reason: 'exceeded' };
    }
    await counter.update({ used_count: nextCount });
    return { ok: true, used: nextCount, limit };
  } catch (error) {
    console.error('consumeQuotaDirect 失败:', error);
    return { ok: false, used: 0, limit: 0, reason: 'error' };
  }
}

module.exports.consumeQuotaDirect = consumeQuotaDirect;
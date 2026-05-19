const express = require('express');
const router = express.Router();
const { DetectionSchedule } = require('../models');
const AIPlatformService = require('../services/AIPlatformService');
const SchedulerService = require('../services/SchedulerService');
const ScheduleProjectContextService = require('../services/ScheduleProjectContextService');
const { authRequired } = require('../middleware/auth');

const MAINLAND_MONITORING_PLATFORMS = ['doubao', 'deepseek'];

async function resolveProjectContext(req, source) {
  return ScheduleProjectContextService.resolveProjectContext({ user: req.user, source });
}

// 创建每日定时任务
router.post('/', authRequired, async (req, res) => {
  try {
    let { question, platforms, highlight_keywords, daily_time, timezone, enabled, brand } = req.body;
    if (!question || String(question).trim() === '') {
      return res.status(400).json({ success: false, message: '问题不能为空' });
    }
    if (typeof platforms === 'string') {
      platforms = platforms.split(',').map(s => String(s).trim().toLowerCase()).filter(Boolean);
    }
    const projectContext = await resolveProjectContext(req, req.body);
    if (projectContext.error) {
      return res.status(projectContext.error.status).json({ success: false, message: projectContext.error.message });
    }
    if (!Array.isArray(platforms) || platforms.length === 0) {
      platforms = ScheduleProjectContextService.defaultPlatformsForContext(
        AIPlatformService.getAvailablePlatforms().filter(p => MAINLAND_MONITORING_PLATFORMS.includes(p)),
        projectContext
      );
      if (!Array.isArray(platforms) || platforms.length === 0) {
        return res.status(400).json({ success: false, message: projectContext.project_id ? '当前项目或 Prompt 没有可用的监测平台' : '当前没有可用的监测平台，请联系管理员处理' });
      }
    } else {
      const platformResult = ScheduleProjectContextService.validatePlatformsWithinContext(
        platforms,
        projectContext,
        '定时任务平台必须包含在项目或 Prompt 的监测平台内'
      );
      if (!platformResult.ok) {
        return res.status(400).json({ success: false, message: platformResult.message || '定时任务仅支持豆包和 DeepSeek' });
      }
      platforms = platformResult.platforms;
    }
    if (platforms.length === 0) {
      return res.status(400).json({ success: false, message: '定时任务仅支持豆包和 DeepSeek' });
    }
    if (typeof daily_time !== 'string' || !/^\d{2}:\d{2}$/.test(daily_time)) {
      return res.status(400).json({ success: false, message: 'daily_time 必须是 HH:mm 格式' });
    }
    const [hh, mm] = daily_time.split(':').map(n => parseInt(n, 10));
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) {
      return res.status(400).json({ success: false, message: '时间不合法，小时0-23，分钟0-59' });
    }
    if (typeof timezone !== 'string' || timezone.trim() === '') {
      timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    }
    const schedule = await DetectionSchedule.create({
      user_id: projectContext.user_id,
      project_id: projectContext.project_id,
      tracked_prompt_id: projectContext.tracked_prompt_id,
      question: String(question),
      platforms,
      highlight_keywords: Array.isArray(highlight_keywords) ? highlight_keywords : [],
      daily_time,
      timezone,
      enabled: enabled !== false,
      brand: brand ? String(brand).trim() : null
    });
    await SchedulerService.refresh(schedule.id);
    return res.json({ success: true, message: '定时任务创建成功', data: schedule });
  } catch (error) {
    console.error('创建定时任务失败:', error);
    return res.status(500).json({ success: false, message: '创建定时任务失败' });
  }
});

// 列出当前用户定时任务
router.get('/', authRequired, async (req, res) => {
  try {
    const user_id = req.user.id; // 已通过 authRequired 验证
    const list = await DetectionSchedule.findAll({ where: { user_id }, order: [['id', 'DESC']] });
    return res.json({ success: true, data: list });
  } catch (error) {
    console.error('获取定时任务列表失败:', error);
    return res.status(500).json({ success: false, message: '获取定时任务列表失败' });
  }
});

// 更新定时任务
router.put('/:id', authRequired, async (req, res) => {
  try {
    const { id } = req.params;
    const schedule = await DetectionSchedule.findByPk(id);
    if (!schedule) return res.status(404).json({ success: false, message: '任务不存在' });
    if (!ScheduleProjectContextService.canOperateSchedule(schedule, req.user)) {
      return res.status(403).json({ success: false, message: '无权操作该任务' });
    }

    let { question, platforms, highlight_keywords, daily_time, timezone, enabled, brand } = req.body;
    const payload = {};
    let resolvedProjectContext = null;
    if (req.body.project_id !== undefined || req.body.prompt_id !== undefined || req.body.tracked_prompt_id !== undefined) {
      const projectContext = await resolveProjectContext(req, req.body);
      if (projectContext.error) {
        return res.status(projectContext.error.status).json({ success: false, message: projectContext.error.message });
      }
      resolvedProjectContext = projectContext;
      payload.project_id = projectContext.project_id;
      payload.tracked_prompt_id = projectContext.tracked_prompt_id;
      payload.user_id = projectContext.user_id;
      if (projectContext.project_id && platforms == null) {
        const currentPlatforms = Array.isArray(schedule.platforms) ? schedule.platforms : [];
        const scopedPlatforms = ScheduleProjectContextService.defaultPlatformsForContext(currentPlatforms, projectContext);
        payload.platforms = scopedPlatforms.length ? scopedPlatforms : projectContext.allowed_platforms;
      }
    }
    if (question != null) {
      if (!String(question).trim()) return res.status(400).json({ success: false, message: '问题不能为空' });
      payload.question = String(question);
    }
    if (brand !== undefined) {
      payload.brand = brand ? String(brand).trim() : null;
    }
    if (platforms != null) {
      if (typeof platforms === 'string') {
        platforms = platforms.split(',').map(s => String(s).trim().toLowerCase()).filter(Boolean);
      }
      if (!Array.isArray(platforms) || platforms.length === 0) {
        return res.status(400).json({ success: false, message: '平台列表不能为空' });
      }
      const platformContext = resolvedProjectContext
        ? resolvedProjectContext
        : (schedule.project_id ? await resolveProjectContext(req, {
          project_id: schedule.project_id,
          tracked_prompt_id: schedule.tracked_prompt_id
        }) : null);
      if (platformContext?.error) {
        return res.status(platformContext.error.status).json({ success: false, message: platformContext.error.message });
      }
      const platformResult = ScheduleProjectContextService.validatePlatformsWithinContext(
        platforms,
        platformContext,
        '定时任务平台必须包含在项目或 Prompt 的监测平台内'
      );
      if (!platformResult.ok) {
        return res.status(400).json({ success: false, message: platformResult.message || '定时任务仅支持豆包和 DeepSeek' });
      }
      payload.platforms = platformResult.platforms;
    }
    if (highlight_keywords != null) {
      payload.highlight_keywords = Array.isArray(highlight_keywords) ? highlight_keywords : [];
    }
    if (daily_time != null) {
      if (typeof daily_time !== 'string' || !/^\d{2}:\d{2}$/.test(daily_time)) {
        return res.status(400).json({ success: false, message: 'daily_time 必须是 HH:mm 格式' });
      }
      const [hh, mm] = daily_time.split(':').map(n => parseInt(n, 10));
      if (hh < 0 || hh > 23 || mm < 0 || mm > 59) {
        return res.status(400).json({ success: false, message: '时间不合法，小时0-23，分钟0-59' });
      }
      payload.daily_time = daily_time;
    }
    if (timezone != null) {
      payload.timezone = typeof timezone === 'string' && timezone.trim() ? timezone : (Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
    }
    if (enabled != null) {
      payload.enabled = !!enabled;
    }

    await schedule.update(payload);
    await SchedulerService.refresh(schedule.id);
    return res.json({ success: true, message: '任务已更新', data: schedule });
  } catch (error) {
    console.error('更新定时任务失败:', error);
    return res.status(500).json({ success: false, message: '更新定时任务失败' });
  }
});

// 删除定时任务
router.delete('/:id', authRequired, async (req, res) => {
  try {
    const { id } = req.params;
    const schedule = await DetectionSchedule.findByPk(id);
    if (!schedule) return res.status(404).json({ success: false, message: '任务不存在' });
    if (!ScheduleProjectContextService.canOperateSchedule(schedule, req.user)) {
      return res.status(403).json({ success: false, message: '无权操作该任务' });
    }
    await DetectionSchedule.destroy({ where: { id } });
    return res.json({ success: true, message: '任务已删除' });
  } catch (error) {
    console.error('删除定时任务失败:', error);
    return res.status(500).json({ success: false, message: '删除定时任务失败' });
  }
});

// 立即执行一次
router.post('/:id/run', authRequired, async (req, res) => {
  try {
    const { id } = req.params;
    const schedule = await DetectionSchedule.findByPk(id);
    if (!schedule) return res.status(404).json({ success: false, message: '任务不存在' });
    if (!ScheduleProjectContextService.canOperateSchedule(schedule, req.user)) {
      return res.status(403).json({ success: false, message: '无权操作该任务' });
    }
    const ok = await SchedulerService.runNow(id);
    if (!ok) return res.status(500).json({ success: false, message: '执行失败' });
    return res.json({ success: true, message: '已触发执行', data: schedule });
  } catch (error) {
    console.error('手动执行任务失败:', error);
    return res.status(500).json({ success: false, message: '手动执行任务失败' });
  }
});

module.exports = router;

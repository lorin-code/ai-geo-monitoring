const { BrandProject, DetectionSchedule, QuestionRecord, ResultDetail, TrackedPrompt, User } = require('../models');
const { Op } = require('sequelize');
const AIPlatformService = require('./AIPlatformService');
const ResultParserService = require('./ResultParserService');
const ProjectRunService = require('./ProjectRunService');
const ProjectRecordFinalizationService = require('./ProjectRecordFinalizationService');
const { consumeQuotaDirect } = require('../middleware/quota');
const MAINLAND_PROJECT_PLATFORMS = ['doubao', 'deepseek'];
const SAFE_PLATFORM_FAILURE_MESSAGE = '监测平台调用失败，请稍后重试';

function computeNextRun(dailyTime, timezone) {
  try {
    const [hhRaw, mmRaw] = String(dailyTime).split(':').map(n => parseInt(n, 10));
    const hh = Number.isInteger(hhRaw) && hhRaw >= 0 && hhRaw <= 23 ? hhRaw : 9;
    const mm = Number.isInteger(mmRaw) && mmRaw >= 0 && mmRaw <= 59 ? mmRaw : 0;
    const now = new Date();
    const next = new Date();
    next.setSeconds(0, 0);
    next.setHours(hh, mm, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next;
  } catch (_) {
    const n = new Date();
    n.setMinutes(n.getMinutes() + 5);
    return n;
  }
}

async function validateScheduleProject(schedule, repositories = {}) {
  if (!schedule?.project_id) return { ok: true };
  const ProjectRepository = repositories.BrandProject || BrandProject;
  const PromptRepository = repositories.TrackedPrompt || TrackedPrompt;
  const project = await ProjectRepository.findByPk(schedule.project_id);
  const projectData = project?.toJSON ? project.toJSON() : project;
  if (!projectData) {
    await schedule.update?.({ enabled: false });
    return { ok: false, reason: '项目不存在' };
  }
  if (projectData.status === 'archived') {
    await schedule.update?.({ enabled: false });
    return { ok: false, reason: '项目已归档' };
  }
  if (schedule.tracked_prompt_id) {
    const prompt = await PromptRepository.findOne({
      where: {
        id: schedule.tracked_prompt_id,
        project_id: schedule.project_id
      }
    });
    const promptData = prompt?.toJSON ? prompt.toJSON() : prompt;
    if (!promptData || promptData.enabled === false) {
      await schedule.update?.({ enabled: false });
      return { ok: false, reason: 'Prompt 已停用或不存在' };
    }
  }
  return { ok: true, project: projectData };
}

async function submitDetectionForSchedule(schedule, options = {}) {
  let projectData = options.project || null;
  if (!options.projectValidated) {
    const projectGuard = await validateScheduleProject(schedule);
    if (!projectGuard.ok) {
      return { ok: false, skipped: true, reason: projectGuard.reason };
    }
    projectData = projectGuard.project || null;
  }

  const { user_id, question, platforms, highlight_keywords } = schedule;
  const platformsList = normalizeSchedulePlatforms(platforms, projectData);
  const keywordsArr = Array.isArray(highlight_keywords) ? highlight_keywords : [];

  // 配额检查：严格按会员控制，每次按平台数量扣减
  try {
    const consume = await consumeQuotaDirect(user_id, 'detection', platformsList.length);
    if (!consume.ok) {
      console.warn(`定时任务配额不足或不可用: user=${user_id}, need=${platformsList.length}, limit=${consume.limit}, used=${consume.used}`);
      const reasonMap = {
        not_allowed: '当前会员等级不允许使用该功能',
        exceeded: '今日可用检测次数不足',
        error: '配额检查失败'
      };
      const errMsg = reasonMap[consume.reason] || '配额不足';
      // 为每个平台生成失败历史记录，便于用户在历史中看到失败原因
      for (const platform of platformsList) {
        try {
          await QuestionRecord.create({
            user_id,
            project_id: schedule.project_id || null,
            tracked_prompt_id: schedule.tracked_prompt_id || null,
            platform,
            question,
            brand: schedule.brand,
            brand_keywords: keywordsArr.join(','),
            status: 'failed',
            error_message: errMsg
          });
        } catch (e) {
          console.warn('创建配额不足失败记录异常:', e?.message || e);
        }
      }
      return { ok: false, reason: 'quota_unavailable', attempted: platformsList.length };
    }
  } catch (e) {
    console.warn('定时任务配额检查失败:', e?.message || e);
    return { ok: false, reason: 'quota_check_failed' };
  }
  let attempted = 0;
  let completed = 0;
  let failed = 0;
  for (const platform of platformsList) {
    let rec = null;
    attempted += 1;
    try {
      rec = await QuestionRecord.create({
        user_id,
        project_id: schedule.project_id || null,
        tracked_prompt_id: schedule.tracked_prompt_id || null,
        platform,
        question,
        brand: schedule.brand,
        brand_keywords: keywordsArr.join(',')
      });

      const result = await AIPlatformService.queryPlatform(platform, question);
      if (!result.success) {
        console.warn('定时任务平台调用失败:', result.error || result.message || platform);
        await QuestionRecord.update(
          { status: 'failed', error_message: SAFE_PLATFORM_FAILURE_MESSAGE },
          { where: { id: rec.id } }
        );
        failed += 1;
        continue;
      }

      const originalText = ResultParserService.extractResponseText(result.data);
      if (!String(originalText || '').trim()) {
        await QuestionRecord.update(
          { status: 'failed', error_message: '监测平台返回内容为空' },
          { where: { id: rec.id } }
        );
        failed += 1;
        continue;
      }
      await ResultDetail.create({
        question_record_id: rec.id,
        ai_response_original: originalText,
        parsing_status: 'completed'
      });

      const finalization = await finalizeScheduledProjectRecord({
        record: rec,
        responseText: originalText,
        aiResponse: result.data,
        keywords: keywordsArr
      });
      if (finalization?.ok) {
        completed += 1;
      } else {
        failed += 1;
      }
    } catch (e) {
      console.warn('执行定时任务查询失败:', e?.message || e);
      failed += 1;
      if (rec?.id) {
        try {
          await QuestionRecord.update(
            { status: 'failed', error_message: SAFE_PLATFORM_FAILURE_MESSAGE },
            { where: { id: rec.id } }
          );
        } catch (updateError) {
          console.warn('标记定时任务失败记录异常:', updateError?.message || updateError);
        }
      }
    }
  }
  return { ok: completed > 0, completed, failed, attempted };
}

async function finalizeScheduledProjectRecord({
  record,
  responseText,
  aiResponse = null,
  keywords = [],
  repositories = {},
  projectRunService = ProjectRunService
}) {
  const result = await ProjectRecordFinalizationService.finalize({
    record,
    responseText,
    aiResponse,
    keywords,
    repositories,
    projectRunService
  });
  if (!result.ok) {
    const error = result.error;
    console.warn('创建定时任务可见性指标失败:', error?.message || error);
  }
  return result;
}

function normalizeSchedulePlatforms(platforms, project = null) {
  const scheduled = (Array.isArray(platforms) ? platforms : [])
    .map(p => String(p || '').trim().toLowerCase())
    .filter(p => MAINLAND_PROJECT_PLATFORMS.includes(p));
  if (!project?.id) return Array.from(new Set(scheduled));

  const projectPlatforms = (Array.isArray(project.platforms) && project.platforms.length
    ? project.platforms
    : MAINLAND_PROJECT_PLATFORMS)
    .map(p => String(p || '').trim().toLowerCase())
    .filter(p => MAINLAND_PROJECT_PLATFORMS.includes(p));
  const projectSet = new Set(projectPlatforms.length ? projectPlatforms : MAINLAND_PROJECT_PLATFORMS);
  return Array.from(new Set(scheduled.filter(p => projectSet.has(p))));
}

class SchedulerService {
  constructor() {
    this._timer = null;
    this._started = false;
  }

  async start() {
    if (this._started) return;
    this._started = true;
    await this.refresh();
    await this.recoverStalePendingRecords();
    this._timer = setInterval(() => this.tick().catch(() => { }), 30 * 1000);
  }

  normalizeProjectMonitoring(project) {
    const rawTime = String(project?.monitoring_time || '09:00').trim();
    const match = rawTime.match(/^(\d{1,2}):(\d{1,2})$/);
    const hh = match ? Math.max(0, Math.min(23, Number(match[1]))) : 9;
    const mm = match ? Math.max(0, Math.min(59, Number(match[2]))) : 0;
    const platformList = Array.isArray(project?.platforms) && project.platforms.length
      ? project.platforms
      : MAINLAND_PROJECT_PLATFORMS;
    const platforms = Array.from(new Set(platformList
      .map((item) => String(item || '').trim().toLowerCase())
      .filter((item) => MAINLAND_PROJECT_PLATFORMS.includes(item))));
    return {
      monitoring_enabled: project?.monitoring_enabled === true || project?.monitoring_enabled === 'true',
      monitoring_time: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`,
      platforms: platforms.length ? platforms : MAINLAND_PROJECT_PLATFORMS
    };
  }

  nextProjectRunAt(monitoringTime) {
    return computeNextRun(monitoringTime);
  }

  async finalizeScheduledProjectRecord(options) {
    return finalizeScheduledProjectRecord(options);
  }

  async validateScheduleProject(schedule, repositories = {}) {
    return validateScheduleProject(schedule, repositories);
  }

  normalizeSchedulePlatforms(platforms, project = null) {
    return normalizeSchedulePlatforms(platforms, project);
  }

  async stop() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
    this._started = false;
  }

  async refresh(scheduleId) {
    const where = scheduleId ? { id: scheduleId } : {};
    const rows = await DetectionSchedule.findAll({ where });
    for (const row of rows) {
      const next = computeNextRun(row.daily_time, row.timezone);
      await row.update({ next_run_at: next });
    }
    if (!scheduleId) {
      const projects = await BrandProject.findAll({ where: { monitoring_enabled: true, status: 'active' } });
      for (const project of projects) {
        const normalized = this.normalizeProjectMonitoring(project.toJSON());
        await project.update({
          monitoring_time: normalized.monitoring_time,
          monitoring_next_run_at: computeNextRun(normalized.monitoring_time)
        });
      }
    }
  }

  async tick() {
    const now = new Date();
    await this.recoverStalePendingRecords({ now });
    const due = await DetectionSchedule.findAll({
      where: {
        enabled: true,
        next_run_at: { [Op.lte]: now }
      }
    });
    for (const s of due) {
      try {
        const result = await submitDetectionForSchedule(s);
        if (result?.skipped) continue;
        if (!result?.ok && !result?.attempted) continue;
        const next = computeNextRun(s.daily_time, s.timezone);
        await s.update({ last_run_at: now, next_run_at: next });
      } catch (e) {
        console.warn('执行定时任务失败:', e?.message || e);
      }
    }
    const dueProjects = await BrandProject.findAll({
      where: {
        status: 'active',
        monitoring_enabled: true,
        monitoring_next_run_at: { [Op.lte]: now }
      }
    });
    for (const project of dueProjects) {
      try {
        await this.runProjectNow(project.id);
      } catch (e) {
        console.warn('执行项目自动监测失败:', e?.message || e);
      }
    }
  }

  async runProjectNow(projectId) {
    const project = await BrandProject.findByPk(projectId);
    if (!project || !project.monitoring_enabled) return false;
    const normalized = this.normalizeProjectMonitoring(project.toJSON());
    const [prompts, user] = await Promise.all([
      TrackedPrompt.findAll({ where: { project_id: project.id, enabled: true }, order: [['updated_at', 'DESC']] }),
      User.findByPk(project.user_id)
    ]);
    if (!user) return false;
    const result = await ProjectRunService.runProject({
      project,
      prompts: prompts.map((item) => item.toJSON()),
      platforms: normalized.platforms,
      user
    });
    if (!result?.ok) {
      await project.update({
        monitoring_time: normalized.monitoring_time,
        monitoring_next_run_at: computeNextRun(normalized.monitoring_time)
      });
      return false;
    }
    await project.update({
      monitoring_time: normalized.monitoring_time,
      monitoring_last_run_at: new Date(),
      monitoring_next_run_at: computeNextRun(normalized.monitoring_time)
    });
    return true;
  }

  async recoverStalePendingRecords(options = {}) {
    const maxAgeMs = Number(options.maxAgeMs || 0) > 0
      ? Number(options.maxAgeMs)
      : 15 * 60 * 1000;
    const now = options.now ? new Date(options.now) : new Date();
    const cutoff = new Date(now.getTime() - maxAgeMs);
    const [count] = await QuestionRecord.update(
      {
        status: 'failed',
        error_message: '分析任务中断，请重新运行'
      },
      {
        where: {
          status: 'pending',
          created_at: { [Op.lt]: cutoff }
        }
      }
    );
    if (count > 0) console.warn(`已恢复 ${count} 条超时未完成分析记录`);
    return count;
  }

  async runNow(scheduleId) {
    const s = await DetectionSchedule.findByPk(scheduleId);
    if (!s) return false;
    try {
      const now = new Date();
      const guard = await this.validateScheduleProject(s);
      if (!guard.ok) return false;
      const result = await submitDetectionForSchedule(s, { projectValidated: true, project: guard.project });
      if (!result?.ok) return false;
      const next = computeNextRun(s.daily_time, s.timezone);
      await s.update({ last_run_at: now, next_run_at: next });
      return true;
    } catch (e) {
      console.warn('手动执行定时任务失败:', e?.message || e);
      return false;
    }
  }
}

module.exports = new SchedulerService();

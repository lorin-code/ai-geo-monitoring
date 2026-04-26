const { DetectionSchedule, QuestionRecord, ResultDetail } = require('../models');
const AIPlatformService = require('./AIPlatformService');
const ResultParserService = require('./ResultParserService');
const { consumeQuotaDirect } = require('../middleware/quota');

// 统计关键词出现次数（与检测路由保持一致的逻辑）
function countKeywordOccurrences(text, keywords, englishWordBoundary = true) {
  const s = typeof text === 'string' ? text : String(text || '');
  const list = Array.isArray(keywords) ? keywords.filter(Boolean) : [];
  const escape = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return list.map((kw) => {
    const e = escape(String(kw));
    const useBoundary = englishWordBoundary && /^[A-Za-z]+$/.test(String(kw));
    const re = new RegExp(useBoundary ? `\\b${e}\\b` : e, 'gi');
    let c = 0;
    for (const _ of s.matchAll(re)) c += 1;
    return { keyword: String(kw), count: c };
  }).filter(item => item.count > 0);
}

function computeNextRun(dailyTime, timezone) {
  try {
    const [hh, mm] = String(dailyTime).split(':').map(n => parseInt(n, 10));
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

async function submitDetectionForSchedule(schedule) {
  const { user_id, question, platforms, highlight_keywords } = schedule;
  const platformsList = Array.isArray(platforms) ? platforms : [];
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
      return;
    }
  } catch (e) {
    console.warn('定时任务配额检查失败:', e?.message || e);
    return;
  }
  for (const platform of platformsList) {
    try {
      const rec = await QuestionRecord.create({
        user_id,
        platform,
        question,
        brand: schedule.brand,
        brand_keywords: keywordsArr.join(',')
      });

      const result = await AIPlatformService.queryPlatform(platform, question);
      if (!result.success) {
        await QuestionRecord.update(
          { status: 'failed', error_message: result.error },
          { where: { id: rec.id } }
        );
        continue;
      }

      const originalText = ResultParserService.extractResponseText(result.data);
      await ResultDetail.create({
        question_record_id: rec.id,
        ai_response_original: originalText,
        parsing_status: 'completed'
      });

      const keywordCounts = countKeywordOccurrences(originalText, keywordsArr, true);
      await QuestionRecord.update(
        { status: 'completed', result_summary: { keyword_counts: keywordCounts } },
        { where: { id: rec.id } }
      );
    } catch (e) {
      console.warn('执行定时任务查询失败:', e?.message || e);
    }
  }
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
    this._timer = setInterval(() => this.tick().catch(() => { }), 30 * 1000);
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
  }

  async tick() {
    const now = new Date();
    const due = await DetectionSchedule.findAll({
      where: {
        enabled: true,
        next_run_at: { [require('sequelize').Op.lte]: now }
      }
    });
    for (const s of due) {
      try {
        await submitDetectionForSchedule(s);
        const next = computeNextRun(s.daily_time, s.timezone);
        await s.update({ last_run_at: now, next_run_at: next });
      } catch (e) {
        console.warn('执行定时任务失败:', e?.message || e);
      }
    }
  }

  async runNow(scheduleId) {
    const s = await DetectionSchedule.findByPk(scheduleId);
    if (!s) return false;
    try {
      const now = new Date();
      await submitDetectionForSchedule(s);
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
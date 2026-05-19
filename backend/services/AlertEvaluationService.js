const { Op } = require('sequelize');
const { AlertRule, BrandCompetitor, BrandProject, QuestionRecord, VisibilityMetric } = require('../models');
const ProjectMetricsService = require('./ProjectMetricsService');
const SourceAnalysisService = require('./SourceAnalysisService');
const PlatformSelectionService = require('./PlatformSelectionService');

const PLATFORM_LABELS = {
  doubao: '豆包',
  deepseek: 'DeepSeek'
};

const ALERT_RULE_TYPES = [
  'visibility_drop',
  'competitor_ahead',
  'negative_sentiment',
  'task_failure',
  'citation_gap',
  'source_drop',
  'platform_gap'
];
const MIN_EFFECTIVE_METRIC_ALERT_CHECKS = 3;

class AlertEvaluationService {
  normalizeRuleType(type, fallback = 'visibility_drop') {
    return ALERT_RULE_TYPES.includes(type) ? type : fallback;
  }

  assertValidRuleType(type) {
    if (!ALERT_RULE_TYPES.includes(type)) {
      const error = new Error(`不支持的告警类型: ${type}`);
      error.code = 'INVALID_ALERT_RULE_TYPE';
      throw error;
    }
    return type;
  }

  buildRulePayload(body = {}, existingType = 'visibility_drop') {
    const payload = {};
    const previousType = this.normalizeRuleType(existingType);
    const type = body.type !== undefined
      ? this.assertValidRuleType(body.type)
      : previousType;
    if (body.type !== undefined) payload.type = type;
    if (body.threshold != null) payload.threshold = this.normalizeThreshold(type, body.threshold);
    if (body.type !== undefined && body.threshold == null && type !== previousType) {
      payload.threshold = this.normalizeThreshold(type, undefined);
    }
    if (body.enabled != null) payload.enabled = !!body.enabled;
    return payload;
  }

  normalizeThreshold(type, value) {
    const parsed = Number(value);
    const fallback = 10;
    const finite = Number.isFinite(parsed) ? parsed : fallback;
    const countTypes = new Set(['task_failure', 'source_drop']);
    if (countTypes.has(type)) {
      return Math.max(1, Math.ceil(finite));
    }
    if (type === 'negative_sentiment') {
      return Math.max(1, Math.min(100, finite));
    }
    if (type === 'competitor_ahead') {
      return Math.max(0, Math.min(1000, finite));
    }
    return Math.max(0, Math.min(100, finite));
  }

  evaluateRules(rules, summary, context = {}) {
    const activeRules = (Array.isArray(rules) ? rules : []).filter((rule) => rule?.enabled !== false);
    const decisions = [];
    const thresholdValue = (rule) => this.normalizeThreshold(rule.type, rule.threshold);
    const hasEffectiveMetrics = Number(summary?.total_checks || 0) >= MIN_EFFECTIVE_METRIC_ALERT_CHECKS;

    for (const rule of activeRules) {
      const threshold = thresholdValue(rule);
      if (rule.type === 'visibility_drop' && hasEffectiveMetrics) {
        const mentionRate = Number(summary?.brand_mention_rate || 0);
        const sov = Number(summary?.avg_share_of_voice || 0);
        const value = Math.min(mentionRate, sov);
        if (value < threshold) {
          decisions.push({
            rule_id: rule.id,
            type: rule.type,
            value,
            message: `品牌提及率 ${mentionRate}% / 声量占比（SOV）${sov}% 低于阈值 ${threshold}%`
          });
        }
      }

      if (rule.type === 'competitor_ahead' && hasEffectiveMetrics) {
        const brandMentions = Number(context.brand_mentions || 0);
        const brandVisibilityScore = Number(context.brand_visibility_score);
        const competitor = (summary?.competitors || []).find((item) => {
          const competitorVisibilityScore = Number(item.visibility_score);
          if (
            Number.isFinite(competitorVisibilityScore)
            && competitorVisibilityScore > 0
            && Number.isFinite(brandVisibilityScore)
          ) {
            return (competitorVisibilityScore - brandVisibilityScore) >= threshold;
          }
          return Number(item.mentions || 0) >= Math.max(threshold, brandMentions + 1);
        });
        if (competitor) {
          const competitorVisibilityScore = Number(competitor.visibility_score);
          const useVisibilityScore = Number.isFinite(competitorVisibilityScore)
            && competitorVisibilityScore > 0
            && Number.isFinite(brandVisibilityScore);
          decisions.push({
            rule_id: rule.id,
            type: rule.type,
            value: useVisibilityScore ? Number((competitorVisibilityScore - brandVisibilityScore).toFixed(2)) : Number(competitor.mentions || 0),
            message: useVisibilityScore
              ? `${competitor.name} 可见度得分 ${competitorVisibilityScore}，高于品牌 ${brandVisibilityScore}，领先 ${Number((competitorVisibilityScore - brandVisibilityScore).toFixed(2))} 分`
              : `${competitor.name} 提及 ${competitor.mentions} 次，高于品牌提及 ${brandMentions} 次`
          });
        }
      }

      if (rule.type === 'negative_sentiment' && hasEffectiveMetrics) {
        const sentimentChecks = Number(summary?.brand_mentioned_checks || 0);
        if (sentimentChecks < MIN_EFFECTIVE_METRIC_ALERT_CHECKS) continue;
        const value = Number(summary?.negative_sentiment_rate || 0);
        if (value >= threshold) {
          decisions.push({
            rule_id: rule.id,
            type: rule.type,
            value,
            message: `品牌提及回答负向情绪占比 ${value}% 达到阈值 ${threshold}%`
          });
        }
      }

      if (rule.type === 'citation_gap' && hasEffectiveMetrics) {
        const value = Number(summary?.citation_rate || 0);
        if (value < threshold) {
          decisions.push({
            rule_id: rule.id,
            type: rule.type,
            value,
            message: `引用率 ${value}% 低于阈值 ${threshold}%`
          });
        }
      }

      if (rule.type === 'platform_gap' && hasEffectiveMetrics) {
        const platformGap = this.calculatePlatformMentionGap(summary?.platforms);
        if (platformGap && platformGap.value >= threshold) {
          decisions.push({
            rule_id: rule.id,
            type: rule.type,
            value: platformGap.value,
            message: `平台提及率差距 ${platformGap.value}%：${this.formatPlatform(platformGap.best.platform)} ${platformGap.best.rate}% / ${this.formatPlatform(platformGap.worst.platform)} ${platformGap.worst.rate}%`
          });
        }
      }

      if (rule.type === 'source_drop' && hasEffectiveMetrics) {
        const sourceDrop = this.calculateSourceDrop(context);
        if (sourceDrop.value >= threshold) {
          decisions.push({
            rule_id: rule.id,
            type: rule.type,
            value: sourceDrop.value,
            message: `流失引用${sourceDrop.label} ${sourceDrop.value} 个达到阈值 ${threshold} 个`
          });
        }
      }

      if (rule.type === 'task_failure') {
        const value = Number(context.failed_checks || 0);
        if (value >= threshold) {
          decisions.push({
            rule_id: rule.id,
            type: rule.type,
            value,
            message: `失败任务 ${value} 条达到阈值 ${threshold} 条`
          });
        }
      }
    }

    return decisions;
  }

  calculateSourceDrop(context = {}) {
    const domains = Number(context.dropped_source_domains || 0);
    const urls = Number(context.dropped_source_urls || 0);
    if (urls > domains) return { value: urls, label: ' URL' };
    return { value: domains, label: '域名' };
  }

  calculatePlatformMentionGap(platforms) {
    const rows = (Array.isArray(platforms) ? platforms : [])
      .filter((item) => Number(item?.checks || 0) >= 2)
      .map((item) => ({
        platform: item.platform || 'unknown',
        rate: Number(item.brand_mention_rate || 0)
      }));
    if (rows.length < 2) return null;
    const sorted = [...rows].sort((a, b) => b.rate - a.rate);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    if (best.rate < 50) return null;
    return {
      best,
      worst,
      value: Number((best.rate - worst.rate).toFixed(2))
    };
  }

  formatPlatform(platform) {
    return PLATFORM_LABELS[platform] || platform || '未知平台';
  }

  async evaluateProject(projectId, userId) {
    const now = new Date();
    const since = new Date(now);
    since.setHours(since.getHours() - 24);
    const sourceDays = 2;
    const sourceSince = new Date(now);
    sourceSince.setHours(sourceSince.getHours() - (24 * sourceDays * 2));
    const project = await BrandProject.findByPk(projectId);
    const projectData = project ? project.toJSON() : {};
    const projectPlatforms = PlatformSelectionService.normalize(projectData.platforms);
    const [rules, metrics, sourceMetrics, failedChecks, competitors] = await Promise.all([
      AlertRule.findAll({ where: { project_id: projectId, enabled: true }, order: [['id', 'ASC']] }),
      VisibilityMetric.findAll({
        where: {
          project_id: projectId,
          platform: { [Op.in]: projectPlatforms },
          created_at: { [Op.between]: [since, now] }
        },
        order: [['created_at', 'ASC']]
      }),
      VisibilityMetric.findAll({
        where: {
          project_id: projectId,
          platform: { [Op.in]: projectPlatforms },
          created_at: { [Op.between]: [sourceSince, now] }
        },
        order: [['created_at', 'ASC']]
      }),
      QuestionRecord.count({
        where: {
          project_id: projectId,
          platform: { [Op.in]: projectPlatforms },
          status: 'failed',
          created_at: { [Op.between]: [since, now] }
        }
      }),
      BrandCompetitor.findAll({ where: { project_id: projectId }, order: [['id', 'ASC']] })
    ]);
    const rows = metrics.map((item) => item.toJSON());
    const sourceRows = sourceMetrics.map((item) => item.toJSON());
    const summary = ProjectMetricsService.summarize(rows);
    const sourceAnalysis = SourceAnalysisService.summarize(sourceRows, {
      brand: projectData,
      competitors: competitors.map((item) => item.toJSON()),
      days: sourceDays,
      referenceDate: now
    });
    const brandMentions = rows.reduce((sum, row) => sum + Number(row.brand_mentions || 0), 0);
    const brandVisibilityScore = rows.reduce((sum, row) => sum + Number(row.visibility_score || 0), 0);
    const decisions = this.evaluateRules(rules.map((item) => item.toJSON()), summary, {
      failed_checks: failedChecks,
      brand_mentions: brandMentions,
      brand_visibility_score: brandVisibilityScore,
      dropped_source_domains: sourceAnalysis.source_changes.dropped_domains.length,
      dropped_source_urls: sourceAnalysis.source_changes.dropped_urls.length
    });
    for (const decision of decisions) {
      await AlertRule.update({
        last_triggered_at: now,
        last_trigger_value: decision.value,
        last_trigger_message: decision.message
      }, {
        where: {
          id: decision.rule_id,
          project_id: projectId,
          ...(userId ? { user_id: userId } : {})
        }
      });
    }
    return decisions;
  }
}

module.exports = new AlertEvaluationService();

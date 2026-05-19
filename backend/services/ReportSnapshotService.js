const { Op } = require('sequelize');
const {
  BrandCompetitor,
  QuestionRecord,
  ReportSnapshot,
  TrackedPrompt,
  VisibilityMetric
} = require('../models');
const ProjectMetricsService = require('./ProjectMetricsService');
const ProjectRunService = require('./ProjectRunService');
const SourceAnalysisService = require('./SourceAnalysisService');
const OpportunityInsightService = require('./OpportunityInsightService');
const PlatformSelectionService = require('./PlatformSelectionService');

const defaultRepositories = {
  BrandCompetitor,
  QuestionRecord,
  ReportSnapshot,
  TrackedPrompt,
  VisibilityMetric
};

function plain(row) {
  return row && typeof row.toJSON === 'function' ? row.toJSON() : row;
}

class ReportSnapshotService {
  resolveSnapshotUser(project, user) {
    const projectOwnerId = Number(project?.user_id || 0);
    const userId = Number(user?.id || 0);
    if (projectOwnerId > 0 && user?.role === 'admin' && userId !== projectOwnerId) {
      return { ...user, id: projectOwnerId, actor_user_id: userId || null };
    }
    return user;
  }

  async findLatest({ project, days, repositories = defaultRepositories }) {
    if (days !== undefined && days !== null && days !== '') {
      const safeDays = ProjectMetricsService.normalizeDays(days);
      const pageSize = 50;
      let offset = 0;

      while (true) {
        const rows = await repositories.ReportSnapshot.findAll({
          where: { project_id: project.id, status: 'generated' },
          order: [['created_at', 'DESC'], ['id', 'DESC']],
          limit: pageSize,
          offset
        });
        const plainRows = rows.map(plain);
        const match = plainRows.find((row) => {
          const periodDays = Number(row?.summary?.period_days || 0) || 30;
          return periodDays === safeDays;
        });
        if (match) return match;
        if (plainRows.length < pageSize) return null;
        offset += pageSize;
      }
    }
    return repositories.ReportSnapshot.findOne({
      where: { project_id: project.id, status: 'generated' },
      order: [['created_at', 'DESC'], ['id', 'DESC']]
    });
  }

  async generate({ project, user, days, repositories = defaultRepositories }) {
    const payload = await this.buildSnapshotPayload({ project, user, days, repositories });
    return repositories.ReportSnapshot.create(payload);
  }

  async buildSnapshotPayload({ project, user, days, repositories = defaultRepositories, now = new Date() }) {
    const {
      days: safeDays,
      periodStart,
      periodEnd,
      changePeriodStart
    } = ProjectMetricsService.buildPeriodWindow(days, { referenceDate: now });

    const projectRow = plain(project);
    const snapshotUser = this.resolveSnapshotUser(projectRow, user);
    const projectPlatforms = PlatformSelectionService.normalize(projectRow?.platforms);
    const [metrics, changeMetrics, records, prompts, competitors] = await Promise.all([
      repositories.VisibilityMetric.findAll({
        where: {
          project_id: project.id,
          platform: { [Op.in]: projectPlatforms },
          created_at: { [Op.between]: [periodStart, periodEnd] }
        },
        order: [['created_at', 'ASC']]
      }),
      repositories.VisibilityMetric.findAll({
        where: {
          project_id: project.id,
          platform: { [Op.in]: projectPlatforms },
          created_at: { [Op.between]: [changePeriodStart, periodEnd] }
        },
        order: [['created_at', 'ASC']]
      }),
      repositories.QuestionRecord.findAll({
        where: {
          project_id: project.id,
          platform: { [Op.in]: projectPlatforms },
          created_at: { [Op.between]: [periodStart, periodEnd] }
        },
        attributes: ['id', 'status', 'tracked_prompt_id', 'created_at'],
        raw: true
      }),
      repositories.TrackedPrompt.findAll({
        where: { project_id: project.id },
        attributes: ['id', 'question', 'tags', 'platforms', 'enabled'],
        raw: true
      }),
      repositories.BrandCompetitor.findAll({
        where: { project_id: project.id },
        order: [['id', 'ASC']]
      })
    ]);

    const metricRows = metrics.map(plain);
    const changeMetricRows = changeMetrics.map(plain);
    const competitorRows = competitors.map(plain);
    const promptRows = prompts.map((prompt) => ({
      ...prompt,
      category: ProjectRunService.derivePromptCategory(prompt)
    }));
    const sourceAnalysis = SourceAnalysisService.summarize(metricRows, {
      brand: projectRow,
      competitors: competitorRows,
      prompts: promptRows,
      days: safeDays,
      referenceDate: periodEnd,
      changeMetrics: changeMetricRows
    });
    const promptPerformance = ProjectMetricsService.buildPromptPerformance(promptRows, metricRows, records);
    const opportunities = OpportunityInsightService.build({
      prompts: promptRows,
      promptPerformance,
      metrics: metricRows,
      sourceOpportunities: sourceAnalysis.opportunities,
      projectPlatforms,
      days: safeDays
    });

    return {
      project_id: project.id,
      user_id: snapshotUser.id,
      period_start: periodStart,
      period_end: periodEnd,
      summary: {
        period_days: safeDays,
        ...ProjectMetricsService.summarize(metricRows),
        ...ProjectMetricsService.summarizeRuns(records),
        categories: ProjectMetricsService.buildPromptCoverage(promptRows, metricRows, records),
        trend: ProjectMetricsService.buildTrend(metricRows, safeDays, { referenceDate: periodEnd }),
        source_summary: sourceAnalysis.summary,
        source_types: sourceAnalysis.source_types,
        source_domains: sourceAnalysis.domains.slice(0, 20),
        source_urls: sourceAnalysis.urls.slice(0, 20),
        source_changes: sourceAnalysis.source_changes,
        opportunities: opportunities.slice(0, 20)
      }
    };
  }
}

module.exports = new ReportSnapshotService();

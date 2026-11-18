const { Op, fn, col } = require('sequelize');
const { BrandProject, VisibilityMetric } = require('../models');
const { getMonitoringPlatforms } = require('../config/monitoringPlatforms');
const ProjectMetricsService = require('./ProjectMetricsService');
const ReportSnapshotService = require('./ReportSnapshotService');

const METRICS = [
  { value: 'brand_mention_rate', label: '品牌提及率', default_order: 'desc', unit: '%' },
  { value: 'avg_share_of_voice', label: '平均声量占比（SOV）', default_order: 'desc', unit: '%' },
  { value: 'citation_rate', label: '引用率', default_order: 'desc', unit: '%' },
  { value: 'recommendation_rate', label: '推荐率', default_order: 'desc', unit: '%' },
  { value: 'avg_brand_rank', label: '平均排名', default_order: 'asc', unit: '' }
];
const defaultRepositories = { BrandProject, VisibilityMetric };
const plain = (row) => row?.toJSON ? row.toJSON() : row;

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

class BrandRankingService {
  constructor() {
    this.generating = new Map();
  }

  projectScope(user) {
    return { status: 'active', ...(user.role === 'admin' ? {} : { user_id: user.id }) };
  }

  normalizeInput(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail('排名条件格式无效');
    const { project_ids: ids, days = 30, platform, metric = 'brand_mention_rate', order } = input;
    if (!Array.isArray(ids) || !ids.length || ids.length > 50
      || ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
      fail('请选择 1 至 50 个品牌项目');
    }
    if (![7, 30, 90].includes(days)) fail('报告周期仅支持近 7、30 或 90 天');
    if (!getMonitoringPlatforms().includes(platform)) fail('请选择有效的监测平台');
    const definition = METRICS.find((item) => item.value === metric);
    if (!definition) fail('排序指标无效');
    const sortOrder = order ?? definition.default_order;
    if (!['asc', 'desc'].includes(sortOrder)) fail('排序方向无效');
    return { project_ids: [...new Set(ids)], days, platform, metric, order: sortOrder };
  }

  async getOptions({ user, repositories = defaultRepositories }) {
    const projects = await repositories.BrandProject.findAll({
      where: this.projectScope(user), attributes: ['id', 'name', 'industry'], order: [['id', 'ASC']], raw: true
    });
    const ids = projects.map((project) => project.id);
    const counts = ids.length ? await repositories.VisibilityMetric.findAll({
      where: { project_id: { [Op.in]: ids }, platform: { [Op.in]: getMonitoringPlatforms() } },
      attributes: ['project_id', 'platform', [fn('COUNT', col('id')), 'checks']],
      group: ['project_id', 'platform'], raw: true
    }) : [];
    return {
      projects: projects.map((project) => ({
        ...project,
        platforms: counts.filter((row) => Number(row.project_id) === project.id && Number(row.checks) > 0)
          .map((row) => row.platform)
      })).filter((project) => project.platforms.length),
      metrics: METRICS,
      platforms: getMonitoringPlatforms()
    };
  }

  isReusable(report, { days, platform, periodStart, now, sample }) {
    const row = plain(report);
    const performance = row?.summary?.platforms?.find((item) => item.platform === platform);
    const coversPlatform = performance || row?.summary?.monitoring_platforms?.includes(platform);
    return Boolean(row && coversPlatform
      && Number(row.summary.period_days || 30) === days
      && new Date(row.period_start).getTime() === periodStart.getTime()
      && new Date(row.period_end).getTime() <= now.getTime()
      && (!sample.latest_created_at || new Date(row.period_end).getTime() >= new Date(sample.latest_created_at).getTime())
      && (!sample.latest_updated_at || new Date(row.created_at).getTime() >= new Date(sample.latest_updated_at).getTime())
      && Number(performance?.checks || 0) === Number(sample.checks));
  }

  async ensureReport({ project, user, days, now, reportService, sample, platform, periodStart }) {
    const key = `${project.id}:${days}:${platform}:${periodStart.toISOString()}`;
    if (this.generating.has(key)) return this.generating.get(key);
    const task = (async () => {
      const latest = await reportService.findLatest({ project, days });
      if (this.isReusable(latest, { days, platform, periodStart, now, sample })) {
        return { report: plain(latest), generated: false };
      }
      return { report: plain(await reportService.generate({ project, user, days, now })), generated: true };
    })();
    this.generating.set(key, task);
    try {
      return await task;
    } finally {
      this.generating.delete(key);
    }
  }

  sortRows(rows, { metric, order }) {
    const valid = (row) => row.status === 'ranked' && Number.isFinite(row.metrics?.[metric]);
    const sorted = [...rows].sort((a, b) => {
      if (valid(a) !== valid(b)) return valid(a) ? -1 : 1;
      const delta = valid(a) ? (a.metrics[metric] - b.metrics[metric]) * (order === 'asc' ? 1 : -1) : 0;
      return delta || a.project_id - b.project_id;
    });
    let previousValue;
    let rank = 0;
    let rankedCount = 0;
    return sorted.map((row) => {
      if (!valid(row)) return { ...row, rank: null };
      rankedCount += 1;
      if (row.metrics[metric] !== previousValue) rank = rankedCount;
      previousValue = row.metrics[metric];
      return { ...row, rank };
    });
  }

  async calculate({ user, input, repositories = defaultRepositories, reportService = ReportSnapshotService, now = new Date() }) {
    const filters = this.normalizeInput(input);
    const projects = await repositories.BrandProject.findAll({
      where: { ...this.projectScope(user), id: { [Op.in]: filters.project_ids } }, order: [['id', 'ASC']]
    });
    // Validate the whole selection before generating any reports, including admin archive restrictions.
    if (projects.length !== filters.project_ids.length) fail('部分品牌项目不存在、已归档或无权访问', 404);
    const { periodStart, periodEnd } = ProjectMetricsService.buildPeriodWindow(filters.days, { referenceDate: now });
    const samples = await repositories.VisibilityMetric.findAll({
      where: {
        project_id: { [Op.in]: filters.project_ids }, platform: filters.platform,
        created_at: { [Op.between]: [periodStart, periodEnd] }
      },
      attributes: ['project_id', [fn('COUNT', col('id')), 'checks'],
        [fn('MAX', col('created_at')), 'latest_created_at'], [fn('MAX', col('updated_at')), 'latest_updated_at']],
      group: ['project_id'], raw: true
    });
    const rows = [];
    // Sequential generation keeps database load bounded; each snapshot queries its dependencies in parallel.
    for (const project of projects) {
      const row = { project_id: project.id, name: project.name, checks: 0, metrics: {}, report: null, generated: false };
      const sample = samples.find((item) => Number(item.project_id) === project.id && Number(item.checks) > 0) || { checks: 0 };
      try {
        const { report, generated } = await this.ensureReport({
          project, user, ...filters, now, reportService, sample, periodStart
        });
        const performance = report.summary?.platforms?.find((item) => item.platform === filters.platform);
        row.generated = generated;
        row.report = { id: report.id, created_at: report.created_at, period_start: report.period_start, period_end: report.period_end };
        row.checks = Number(performance?.checks || 0);
        row.metrics = Object.fromEntries(METRICS.map(({ value }) => {
          const number = performance?.[value];
          return [value, number !== null && number !== undefined && Number.isFinite(Number(number))
            && (value !== 'avg_brand_rank' || Number(number) > 0) ? Number(number) : null];
        }));
        const valid = row.checks > 0 && row.metrics[filters.metric] !== null;
        rows.push({ ...row, status: valid ? 'ranked' : 'no_data',
          reason: valid ? null : (row.checks ? '报告中缺少排序指标的有效数据' : '所选周期和平台没有有效分析数据') });
      } catch {
        rows.push({ ...row, status: 'error', reason: '报告生成失败，请重新计算重试' });
      }
    }
    const sorted = this.sortRows(rows, filters);
    return {
      filters, calculated_at: now.toISOString(), period_start: periodStart, period_end: periodEnd,
      generated_count: rows.filter((row) => row.generated).length,
      ranked_count: sorted.filter((row) => row.rank !== null).length,
      rows: sorted
    };
  }
}

module.exports = new BrandRankingService();

const test = require('node:test');
const assert = require('node:assert/strict');

// This suite owns an isolated database and never touches local project data or upstream APIs.
process.env.DB_STORAGE = ':memory:';
delete process.env.DATABASE_URL;
process.env.NODE_ENV = 'test';
process.env.MONITORING_PLATFORMS = 'doubao,deepseek';
process.env.JWT_SECRET = 'brand-ranking-test-secret';
const express = require('express');
const jwt = require('jsonwebtoken');
const { once } = require('node:events');
const { sequelize, User, BrandProject, QuestionRecord, VisibilityMetric, ReportSnapshot } = require('../models');
const service = require('../services/BrandRankingService');
const snapshots = require('../services/ReportSnapshotService');
const { authRequired } = require('../middleware/auth');

const user = { id: 1, role: 'user' };
let brands;
let now;
let server;
let baseUrl;
const input = (extra = {}) => ({
  project_ids: brands.slice(0, 3).map((brand) => brand.id), days: 30,
  platform: 'deepseek', metric: 'brand_mention_rate', ...extra
});

async function addMetric(project, overrides = {}, age = 1) {
  const date = new Date(now);
  date.setDate(date.getDate() - age);
  const record = await QuestionRecord.create({ user_id: project.user_id, project_id: project.id,
    platform: overrides.platform || 'deepseek', question: '排名测试问题', brand: project.name,
    brand_keywords: project.name, status: 'completed', created_at: date });
  return VisibilityMetric.create({ user_id: project.user_id, project_id: project.id,
    question_record_id: record.id, platform: 'deepseek', brand_mentioned: true, share_of_voice: 50,
    brand_rank: 2, brand_recommended: true, citation_count: 1, created_at: date, updated_at: date, ...overrides }, { silent: true });
}

test.before(async () => {
  await sequelize.sync({ force: true });
  await User.bulkCreate([
    { id: 1, username: 'ranking-owner', email: 'owner@example.com', password: 'unused' },
    { id: 2, username: 'ranking-other', email: 'other@example.com', password: 'unused' }
  ]);
  const app = express();
  app.use(express.json());
  app.use('/rankings', authRequired, require('../routes/brandRankings'));
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}/rankings`;
});

test.beforeEach(async () => {
  await BrandProject.destroy({ where: {} });
  now = new Date();
  brands = await BrandProject.bulkCreate([
    { user_id: 1, name: '甲品牌', platforms: ['doubao', 'deepseek'] },
    { user_id: 1, name: '乙品牌', platforms: ['deepseek'] },
    { user_id: 1, name: '丙品牌', platforms: ['deepseek'] },
    { user_id: 2, name: '其他用户品牌', platforms: ['deepseek'] },
    { user_id: 1, name: '归档品牌', status: 'archived', platforms: ['deepseek'] },
    { user_id: 1, name: '空品牌', platforms: ['deepseek'] }
  ]);
  await addMetric(brands[0], { share_of_voice: 80 });
  await addMetric(brands[0], { brand_mentioned: false, share_of_voice: 0, brand_rank: null });
  await addMetric(brands[0], { platform: 'doubao', share_of_voice: 100 });
  await addMetric(brands[1], { share_of_voice: 60, brand_rank: 3 });
  await addMetric(brands[2], { brand_mentioned: false, share_of_voice: 0, brand_rank: null });
  await addMetric(brands[3]);
  await addMetric(brands[4]);
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await sequelize.close();
});

test('options expose only accessible active brands with actual platform data', async () => {
  const options = await service.getOptions({ user });
  assert.deepEqual(options.projects.map((project) => project.id), brands.slice(0, 3).map((brand) => brand.id));
  assert.deepEqual(options.projects[0].platforms.sort(), ['deepseek', 'doubao']);
  const adminOptions = await service.getOptions({ user: { id: 1, role: 'admin' } });
  assert.equal(adminOptions.projects.length, 4);
});

test('generates missing reports and ranks using the selected platform, not aggregate report totals', async () => {
  const result = await service.calculate({ user, input: input(), now });
  assert.equal(result.generated_count, 3);
  assert.equal(result.ranked_count, 3);
  assert.deepEqual(result.rows.map((row) => row.project_id), [brands[1].id, brands[0].id, brands[2].id]);
  assert.equal(result.rows[1].metrics.brand_mention_rate, 50);
  assert.equal(result.rows[1].metrics.avg_share_of_voice, 40);
  assert.equal(result.rows[1].checks, 2);
  assert.equal(result.rows[2].metrics.brand_mention_rate, 0);
  assert.equal(result.rows[2].rank, 3); // A real zero still ranks.
  assert.equal(await ReportSnapshot.count(), 3);
  const report = await ReportSnapshot.findByPk(result.rows[1].report.id);
  assert.equal(report.summary.total_checks, 3);
  assert.equal(report.summary.platforms.find((row) => row.platform === 'deepseek').checks, 2);
});

test('reuses valid reports and changes ordering for a different metric without generating duplicates', async () => {
  await service.calculate({ user, input: input(), now });
  const result = await service.calculate({ user, input: input({ metric: 'avg_brand_rank' }), now });
  assert.equal(result.generated_count, 0);
  assert.equal(result.filters.order, 'asc');
  assert.equal(result.rows[0].project_id, brands[0].id);
  assert.equal(result.rows[2].rank, null);
  assert.equal(result.rows[2].metrics.avg_brand_rank, null);
  assert.equal(result.ranked_count, 2);
  assert.equal(await ReportSnapshot.count(), 3);
});

test('period boundaries exclude older measurements and distinguish period-specific reports', async () => {
  await addMetric(brands[1], { brand_mentioned: false }, 10);
  await addMetric(brands[1], { brand_mentioned: false }, 40);
  const monthly = await service.calculate({ user, input: input({ project_ids: [brands[1].id] }), now });
  const weekly = await service.calculate({ user, input: input({ project_ids: [brands[1].id], days: 7 }), now });
  assert.equal(monthly.rows[0].metrics.brand_mention_rate, 50);
  assert.equal(monthly.rows[0].checks, 2);
  assert.equal(weekly.rows[0].metrics.brand_mention_rate, 100);
  assert.equal(weekly.generated_count, 1);
  assert.equal((await ReportSnapshot.findByPk(weekly.rows[0].report.id)).summary.period_days, 7);
});

test('no-data brands get an empty report but never a misleading zero rank', async () => {
  const request = input({ project_ids: [brands[5].id] });
  const result = await service.calculate({ user, input: request, now });
  assert.equal(result.generated_count, 1);
  assert.equal(result.ranked_count, 0);
  assert.equal(result.rows[0].rank, null);
  assert.equal(result.rows[0].status, 'no_data');
  assert.ok(result.rows[0].report.id);
  const repeat = await service.calculate({ user, input: request, now });
  assert.equal(repeat.generated_count, 0);
});

test('ties share a rank, later ranks skip, and ascending order puts real zero values first', async () => {
  const result = await service.calculate({ user, input: input({ metric: 'citation_rate' }), now });
  assert.deepEqual(result.rows.map((row) => row.rank), [1, 1, 1]);
  const sorted = service.sortRows([
    { project_id: 3, status: 'ranked', metrics: { citation_rate: 20 } },
    { project_id: 2, status: 'ranked', metrics: { citation_rate: 80 } },
    { project_id: 1, status: 'ranked', metrics: { citation_rate: 80 } },
  ], { metric: 'citation_rate', order: 'desc' });
  assert.deepEqual(sorted.map((row) => row.rank), [1, 1, 3]);
  const ascending = await service.calculate({ user, input: input({ order: 'asc' }), now });
  assert.equal(ascending.rows[0].project_id, brands[2].id);
});

test('refreshes reports after the day changes or measurements are edited', async () => {
  const first = await service.calculate({ user, input: input({ project_ids: [brands[0].id] }), now });
  const sample = await VisibilityMetric.findOne({ where: { project_id: brands[0].id, platform: 'deepseek', brand_mentioned: true } });
  const later = new Date(Date.now() + 1000);
  await sequelize.getQueryInterface().bulkUpdate('visibility_metrics', {
    share_of_voice: 20, updated_at: later.toISOString().replace('T', ' ').replace('Z', ' +00:00')
  }, { id: sample.id });
  const second = await service.calculate({ user, input: input({ project_ids: [brands[0].id] }), now: later });
  assert.equal(second.generated_count, 1);
  assert.notEqual(first.rows[0].report.id, second.rows[0].report.id);
  assert.equal(second.rows[0].metrics.avg_share_of_voice, 10);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const third = await service.calculate({ user, input: input({ project_ids: [brands[0].id] }), now: tomorrow });
  assert.equal(third.generated_count, 1);
});

test('deduplicates concurrent generation and contains a single brand report failure', async () => {
  const request = input({ project_ids: [brands[0].id] });
  let generationCalls = 0;
  const reportService = {
    findLatest: (args) => snapshots.findLatest(args),
    generate: async (args) => { generationCalls += 1; return snapshots.generate(args); }
  };
  const results = await Promise.all([
    service.calculate({ user, input: request, now, reportService }),
    service.calculate({ user, input: request, now, reportService })
  ]);
  assert.equal(generationCalls, 1);
  assert.equal(results[0].rows[0].report.id, results[1].rows[0].report.id);
  const partial = await service.calculate({ user, input: input(), now, reportService: {
    findLatest: (args) => snapshots.findLatest(args),
    generate: (args) => args.project.id === brands[1].id ? Promise.reject(new Error('internal secret')) : snapshots.generate(args)
  } });
  assert.equal(partial.ranked_count, 2);
  assert.equal(partial.rows[2].status, 'error');
  assert.doesNotMatch(JSON.stringify(partial), /internal secret/);
});

test('rejects invalid filters instead of silently broadening the query', () => {
  for (const patch of [{ project_ids: [] }, { project_ids: [1.5] }, { project_ids: ['1'] },
    { project_ids: Array(51).fill(1) }, { days: '30' }, { days: 31 }, { platform: 'unknown' },
    { metric: '__proto__' }, { order: 'sideways' }]) {
    assert.throws(() => service.normalizeInput(input(patch)), { status: 400 });
  }
});

test('HTTP endpoints require login, reject inaccessible and archived selections before writes, and return sorted reports', async () => {
  const token = jwt.sign({ userId: user.id, role: 'user' }, process.env.JWT_SECRET);
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  assert.equal((await fetch(`${baseUrl}/options`)).status, 401);
  assert.equal((await fetch(`${baseUrl}/calculate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input()) })).status, 401);
  const options = await (await fetch(`${baseUrl}/options`, { headers })).json();
  assert.equal(options.data.projects.length, 3);
  for (const id of [brands[3].id, brands[4].id, 999999]) {
    const response = await fetch(`${baseUrl}/calculate`, { method: 'POST', headers,
      body: JSON.stringify(input({ project_ids: [brands[0].id, id] })) });
    assert.equal(response.status, 404);
    assert.equal(await ReportSnapshot.count(), 0);
  }
  const response = await fetch(`${baseUrl}/calculate`, { method: 'POST', headers, body: JSON.stringify(input()) });
  assert.equal(response.status, 200);
  const result = (await response.json()).data;
  assert.equal(result.ranked_count, 3);
  assert.equal(result.rows[0].project_id, brands[1].id);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');

const ReportSnapshotService = require('../services/ReportSnapshotService');

test('finds the latest report snapshot without creating a new one', async () => {
  const repository = {
    createCalls: 0,
    findOneQuery: null,
    async create() {
      this.createCalls += 1;
      throw new Error('latest lookup must not create a report');
    },
    async findOne(query) {
      this.findOneQuery = query;
      return { id: 9, project_id: 2, summary: { total_checks: 3 } };
    }
  };

  const report = await ReportSnapshotService.findLatest({
    project: { id: 2 },
    repositories: { ReportSnapshot: repository }
  });

  assert.equal(report.id, 9);
  assert.equal(repository.createCalls, 0);
  assert.deepEqual(repository.findOneQuery.where, { project_id: 2, status: 'generated' });
  assert.deepEqual(repository.findOneQuery.order, [['created_at', 'DESC'], ['id', 'DESC']]);
});

test('finds the latest report snapshot for a selected period window', async () => {
  const repository = {
    findAllQuery: null,
    async findAll(query) {
      this.findAllQuery = query;
      return [
        { id: 9, project_id: 2, summary: { period_days: 30 } },
        { id: 8, project_id: 2, summary: { period_days: 7 } }
      ];
    }
  };

  const report = await ReportSnapshotService.findLatest({
    project: { id: 2 },
    days: 7,
    repositories: { ReportSnapshot: repository }
  });

  assert.equal(report.id, 8);
  assert.deepEqual(repository.findAllQuery.where, { project_id: 2, status: 'generated' });
  assert.deepEqual(repository.findAllQuery.order, [['created_at', 'DESC'], ['id', 'DESC']]);
});

test('continues scanning report snapshots when the selected period is beyond the first page', async () => {
  const queries = [];
  const repository = {
    async findAll(query) {
      queries.push(query);
      if (query.offset === 0) {
        return Array.from({ length: 50 }, (_, index) => ({
          id: 100 - index,
          project_id: 2,
          summary: { period_days: 30 }
        }));
      }
      return [
        { id: 49, project_id: 2, summary: { period_days: 7 } }
      ];
    }
  };

  const report = await ReportSnapshotService.findLatest({
    project: { id: 2 },
    days: 7,
    repositories: { ReportSnapshot: repository }
  });

  assert.equal(report.id, 49);
  assert.equal(queries.length, 2);
  assert.equal(queries[0].offset, 0);
  assert.equal(queries[1].offset, 50);
});

test('treats legacy report snapshots without period length as 30 day reports', async () => {
  const repository = {
    async findAll() {
      return [
        { id: 10, project_id: 2, summary: {} },
        { id: 9, project_id: 2, summary: { period_days: 7 } }
      ];
    }
  };

  const report = await ReportSnapshotService.findLatest({
    project: { id: 2 },
    days: 30,
    repositories: { ReportSnapshot: repository }
  });

  assert.equal(report.id, 10);
});

test('attributes admin generated report snapshots to the project owner', () => {
  const owner = ReportSnapshotService.resolveSnapshotUser(
    { id: 2, user_id: 9 },
    { id: 1, role: 'admin', username: 'admin' }
  );
  const regularUser = ReportSnapshotService.resolveSnapshotUser(
    { id: 2, user_id: 9 },
    { id: 9, role: 'user', username: 'owner' }
  );

  assert.equal(owner.id, 9);
  assert.equal(owner.actor_user_id, 1);
  assert.equal(regularUser.id, 9);
  assert.equal(regularUser.actor_user_id, undefined);
});

test('stores the selected period length in generated report summaries', async () => {
  const payload = await ReportSnapshotService.buildSnapshotPayload({
    project: { id: 2, user_id: 9, toJSON: () => ({ id: 2, user_id: 9 }) },
    user: { id: 9, role: 'user' },
    days: 7,
    now: new Date('2026-05-15T00:00:00.000Z'),
    repositories: {
      VisibilityMetric: { findAll: async () => [] },
      QuestionRecord: { findAll: async () => [] },
      TrackedPrompt: { findAll: async () => [] },
      BrandCompetitor: { findAll: async () => [] }
    }
  });

  assert.equal(payload.summary.period_days, 7);
});

test('stores top citation urls in generated report summaries', async () => {
  const metric = {
    toJSON: () => ({
      id: 1,
      project_id: 2,
      platform: 'deepseek',
      prompt_id: 7,
      prompt_category: '购买决策',
      citation_sources: [{ url: 'https://example.com/guide?utm_source=ai' }],
      created_at: '2026-05-14T00:00:00.000Z'
    })
  };
  const payload = await ReportSnapshotService.buildSnapshotPayload({
    project: { id: 2, user_id: 9, toJSON: () => ({ id: 2, user_id: 9 }) },
    user: { id: 9, role: 'user' },
    days: 7,
    now: new Date('2026-05-15T00:00:00.000Z'),
    repositories: {
      VisibilityMetric: { findAll: async () => [metric] },
      QuestionRecord: { findAll: async () => [] },
      TrackedPrompt: { findAll: async () => [] },
      BrandCompetitor: { findAll: async () => [] }
    }
  });

  assert.deepEqual(payload.summary.source_urls, [
    {
      url: 'https://example.com/guide',
      domain: 'example.com',
      source_type: '第三方来源',
      citation_count: 1,
      response_count: 1,
      platforms: ['deepseek'],
      categories: ['购买决策']
    }
  ]);
});

test('report snapshots only query metrics from the project monitoring platforms', async () => {
  const visibilityQueries = [];
  const recordQueries = [];
  await ReportSnapshotService.buildSnapshotPayload({
    project: { id: 2, user_id: 9, platforms: ['deepseek'], toJSON: () => ({ id: 2, user_id: 9, platforms: ['deepseek'] }) },
    user: { id: 9, role: 'user' },
    days: 7,
    now: new Date('2026-05-15T00:00:00.000Z'),
    repositories: {
      VisibilityMetric: {
        findAll: async (query) => {
          visibilityQueries.push(query);
          return [];
        }
      },
      QuestionRecord: {
        findAll: async (query) => {
          recordQueries.push(query);
          return [];
        }
      },
      TrackedPrompt: { findAll: async () => [] },
      BrandCompetitor: { findAll: async () => [] }
    }
  });

  assert.equal(visibilityQueries.length, 2);
  assert.deepEqual(visibilityQueries[0].where.platform[Op.in], ['deepseek']);
  assert.deepEqual(visibilityQueries[1].where.platform[Op.in], ['deepseek']);
  assert.equal(recordQueries.length, 1);
  assert.deepEqual(recordQueries[0].where.platform[Op.in], ['deepseek']);
});

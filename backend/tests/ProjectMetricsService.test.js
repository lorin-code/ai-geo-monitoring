const test = require('node:test');
const assert = require('node:assert/strict');

const ProjectMetricsService = require('../services/ProjectMetricsService');

test('normalizes analytics day windows safely', () => {
  assert.equal(ProjectMetricsService.normalizeDays(undefined), 30);
  assert.equal(ProjectMetricsService.normalizeDays('abc'), 30);
  assert.equal(ProjectMetricsService.normalizeDays('0'), 1);
  assert.equal(ProjectMetricsService.normalizeDays('7.8'), 7);
  assert.equal(ProjectMetricsService.normalizeDays('500'), 365);
});

test('builds calendar aligned metric query windows', () => {
  const window = ProjectMetricsService.buildPeriodWindow(7, {
    referenceDate: new Date('2026-05-17T15:30:00.000+08:00')
  });

  assert.equal(ProjectMetricsService.formatDateKey(window.periodStart), '2026-05-11');
  assert.equal(ProjectMetricsService.formatDateKey(window.changePeriodStart), '2026-05-04');
  assert.equal(window.periodStart.getHours(), 0);
  assert.equal(window.periodStart.getMinutes(), 0);
  assert.equal(window.periodStart.getSeconds(), 0);
  assert.equal(window.periodStart.getMilliseconds(), 0);
  assert.equal(window.periodEnd.toISOString(), new Date('2026-05-17T15:30:00.000+08:00').toISOString());
});

test('summarizes project visibility metrics by platform and competitor', () => {
  const summary = ProjectMetricsService.summarize([
    {
      platform: 'doubao',
      brand_mentioned: true,
      brand_mentions: 2,
      share_of_voice: 66.67,
      brand_rank: 1,
      brand_recommended: true,
      citation_count: 2,
      owned_citation_count: 1,
      prompt_category: '购买决策',
      competitor_mentions: [{ name: 'DeepSeek', mentions: 1, mentioned: true, visibility_score: 2 }]
    },
    {
      platform: 'deepseek',
      brand_mentioned: false,
      brand_mentions: 0,
      share_of_voice: 0,
      brand_rank: null,
      brand_recommended: false,
      citation_count: 0,
      owned_citation_count: 0,
      prompt_category: '竞品对比',
      competitor_mentions: [{ name: 'DeepSeek', mentions: 2, mentioned: true, visibility_score: 5 }]
    }
  ]);

  assert.equal(summary.total_checks, 2);
  assert.equal(summary.brand_mentioned_checks, 1);
  assert.equal(summary.brand_mention_rate, 50);
  assert.equal(summary.avg_share_of_voice, 33.34);
  assert.equal(summary.citation_rate, 50);
  assert.equal(summary.owned_citation_rate, 50);
  assert.equal(summary.recommendation_rate, 50);
  assert.equal(summary.avg_brand_rank, 1);
  assert.deepEqual(summary.platforms, [
    { platform: 'deepseek', checks: 1, brand_mention_rate: 0, avg_share_of_voice: 0, citation_rate: 0, recommendation_rate: 0, avg_brand_rank: 0 },
    { platform: 'doubao', checks: 1, brand_mention_rate: 100, avg_share_of_voice: 66.67, citation_rate: 100, recommendation_rate: 100, avg_brand_rank: 1 }
  ]);
  assert.deepEqual(summary.competitors, [
    { name: 'DeepSeek', mentions: 3, appeared_checks: 2, visibility_score: 7 }
  ]);
  assert.deepEqual(summary.categories, [
    { category: '购买决策', checks: 1, brand_mention_rate: 100, avg_share_of_voice: 66.67, citation_rate: 100, recommendation_rate: 100 },
    { category: '竞品对比', checks: 1, brand_mention_rate: 0, avg_share_of_voice: 0, citation_rate: 0, recommendation_rate: 0 }
  ]);
});

test('omits competitors with no mentions from dashboard summaries', () => {
  const summary = ProjectMetricsService.summarize([
    {
      platform: 'doubao',
      brand_mentioned: true,
      share_of_voice: 60,
      competitor_mentions: [
        { name: '马牌', mentioned: false, mentions: 0, visibility_score: 0 },
        { name: '固特异', mentioned: true, mentions: 2, visibility_score: 4 }
      ]
    },
    {
      platform: 'deepseek',
      brand_mentioned: false,
      share_of_voice: 0,
      competitor_mentions: [
        { name: '马牌', mentioned: false, mentions: 0, visibility_score: 0 }
      ]
    }
  ]);

  assert.deepEqual(summary.competitors, [
    { name: '固特异', mentions: 2, appeared_checks: 1, visibility_score: 4 }
  ]);
});

test('normalizes stored metric prompt categories in dashboard summaries', () => {
  const summary = ProjectMetricsService.summarize([
    {
      platform: 'doubao',
      prompt_category: '历史脏分类',
      question: '马牌和米其林哪个好',
      brand_mentioned: true,
      share_of_voice: 60,
      citation_count: 1,
      brand_recommended: true
    },
    {
      platform: 'deepseek',
      prompt_category: '购买决策',
      question: '静音轮胎怎么选',
      brand_mentioned: false,
      share_of_voice: 0,
      citation_count: 0,
      brand_recommended: false
    }
  ]);

  assert.deepEqual(summary.categories.map((item) => ({
    category: item.category,
    checks: item.checks
  })), [
    { category: '购买决策', checks: 1 },
    { category: '竞品对比', checks: 1 }
  ]);
});

test('summarizes run records separately from effective analysis metrics', () => {
  const stats = ProjectMetricsService.summarizeRuns([
    { status: 'completed' },
    { status: 'failed' },
    { status: 'pending' }
  ]);

  assert.deepEqual(stats, {
    total_runs: 3,
    completed_runs: 1,
    failed_runs: 1,
    pending_runs: 1,
    failure_rate: 33.33
  });
});

test('calculates negative sentiment rate from brand-mentioned answers only', () => {
  const summary = ProjectMetricsService.summarize([
    { brand_mentioned: true, sentiment: 'negative' },
    { brand_mentioned: true, sentiment: 'neutral' },
    { brand_mentioned: false, sentiment: 'neutral' },
    { brand_mentioned: false, sentiment: 'neutral' }
  ]);

  assert.equal(summary.total_checks, 4);
  assert.equal(summary.brand_mention_rate, 50);
  assert.equal(summary.negative_sentiment_rate, 50);
});

test('builds prompt library coverage with analyzed performance by category', () => {
  const coverage = ProjectMetricsService.buildPromptCoverage([
    { id: 1, enabled: true, category: '购买决策' },
    { id: 2, enabled: false, category: '购买决策' },
    { id: 3, enabled: true, category: '竞品对比' }
  ], [
    { prompt_id: 1, prompt_category: '购买决策', brand_mentioned: true, share_of_voice: 80, citation_count: 1, brand_recommended: true },
    { prompt_id: 999, prompt_category: '历史分类', brand_mentioned: true, share_of_voice: 100, citation_count: 1, brand_recommended: true }
  ]);

  assert.deepEqual(coverage, [
    {
      category: '购买决策',
      prompt_count: 2,
      enabled_prompt_count: 1,
      total_runs: 0,
      failed_runs: 0,
      failure_rate: 0,
      checks: 1,
      brand_mention_rate: 100,
      avg_share_of_voice: 80,
      citation_rate: 100,
      recommendation_rate: 100
    },
    {
      category: '竞品对比',
      prompt_count: 1,
      enabled_prompt_count: 1,
      total_runs: 0,
      failed_runs: 0,
      failure_rate: 0,
      checks: 0,
      brand_mention_rate: 0,
      avg_share_of_voice: 0,
      citation_rate: 0,
      recommendation_rate: 0
    }
  ]);
});

test('derives prompt coverage categories from prompt tags when category is not stored', () => {
  const coverage = ProjectMetricsService.buildPromptCoverage([
    { id: 1, enabled: true, question: '静音轮胎怎么选', tags: ['购买决策'] },
    { id: 2, enabled: true, question: '新能源车轮胎推荐', tags: ['产品适配'] }
  ], [
    { prompt_id: 1, brand_mentioned: true, share_of_voice: 80, citation_count: 1, brand_recommended: true },
    { prompt_id: 2, brand_mentioned: false, share_of_voice: 0, citation_count: 0, brand_recommended: false }
  ]);

  assert.deepEqual(coverage.map((item) => ({
    category: item.category,
    prompt_count: item.prompt_count,
    checks: item.checks
  })), [
    { category: '产品适配', prompt_count: 1, checks: 1 },
    { category: '购买决策', prompt_count: 1, checks: 1 }
  ]);
});

test('adds category level run failures to prompt coverage', () => {
  const coverage = ProjectMetricsService.buildPromptCoverage([
    { id: 1, enabled: true, category: '购买决策' },
    { id: 2, enabled: true, category: '购买决策' },
    { id: 3, enabled: true, category: '竞品对比' }
  ], [
    { prompt_id: 1, brand_mentioned: true, share_of_voice: 80, citation_count: 1, brand_recommended: true }
  ], [
    { tracked_prompt_id: 1, status: 'completed' },
    { tracked_prompt_id: 2, status: 'failed' },
    { tracked_prompt_id: 3, status: 'failed' }
  ]);

  assert.deepEqual(coverage.map((item) => ({
    category: item.category,
    checks: item.checks,
    total_runs: item.total_runs,
    failed_runs: item.failed_runs,
    failure_rate: item.failure_rate
  })), [
    { category: '购买决策', checks: 1, total_runs: 2, failed_runs: 1, failure_rate: 50 },
    { category: '竞品对比', checks: 0, total_runs: 1, failed_runs: 1, failure_rate: 100 }
  ]);
});

test('builds prompt-level performance for prompt library rows', () => {
  const performance = ProjectMetricsService.buildPromptPerformance([
    { id: 1, question: '静音轮胎怎么选', enabled: true },
    { id: 2, question: '新能源车轮胎推荐', enabled: true }
  ], [
    {
      prompt_id: 1,
      brand_mentioned: true,
      share_of_voice: 80,
      citation_count: 2,
      brand_recommended: true,
      brand_rank: 1,
      sentiment: 'positive',
      created_at: '2026-05-01T00:00:00.000Z'
    },
    {
      prompt_id: 1,
      brand_mentioned: false,
      share_of_voice: 0,
      citation_count: 0,
      brand_recommended: false,
      brand_rank: null,
      sentiment: 'negative',
      created_at: '2026-05-02T00:00:00.000Z'
    },
    {
      prompt_id: 999,
      brand_mentioned: true,
      share_of_voice: 100,
      citation_count: 1,
      brand_recommended: true,
      brand_rank: 1,
      sentiment: 'positive',
      created_at: '2026-05-03T00:00:00.000Z'
    }
  ]);

  assert.deepEqual(performance, {
    1: {
      checks: 2,
      total_runs: 0,
      completed_runs: 0,
      failed_runs: 0,
      brand_mention_rate: 50,
      avg_share_of_voice: 40,
      citation_rate: 50,
      recommendation_rate: 50,
      avg_brand_rank: 1,
      positive_sentiment_count: 1,
      neutral_sentiment_count: 0,
      negative_sentiment_count: 0,
      last_run_at: '2026-05-02T00:00:00.000Z'
    },
    2: {
      checks: 0,
      total_runs: 0,
      completed_runs: 0,
      failed_runs: 0,
      brand_mention_rate: 0,
      avg_share_of_voice: 0,
      citation_rate: 0,
      recommendation_rate: 0,
      avg_brand_rank: 0,
      positive_sentiment_count: 0,
      neutral_sentiment_count: 0,
      negative_sentiment_count: 0,
      last_run_at: null
    }
  });
});

test('uses prompt run records for last run time even when no visibility metric exists', () => {
  const performance = ProjectMetricsService.buildPromptPerformance([
    { id: 1, question: '静音轮胎怎么选', enabled: true },
    { id: 2, question: '新能源车轮胎推荐', enabled: true }
  ], [
    {
      prompt_id: 1,
      brand_mentioned: true,
      share_of_voice: 80,
      citation_count: 1,
      brand_recommended: true,
      brand_rank: 1,
      sentiment: 'positive',
      created_at: '2026-05-02T00:00:00.000Z'
    }
  ], [
    {
      tracked_prompt_id: 1,
      status: 'failed',
      created_at: '2026-05-03T00:00:00.000Z'
    },
    {
      tracked_prompt_id: 2,
      status: 'failed',
      created_at: '2026-05-04T00:00:00.000Z'
    }
  ]);

  assert.equal(performance[1].checks, 1);
  assert.equal(performance[1].last_run_at, '2026-05-03T00:00:00.000Z');
  assert.equal(performance[2].checks, 0);
  assert.equal(performance[2].last_run_at, '2026-05-04T00:00:00.000Z');
});

test('uses statusless prompt record aggregates only for last run time', () => {
  const performance = ProjectMetricsService.buildPromptPerformance([
    { id: 1, question: '静音轮胎怎么选', enabled: true }
  ], [], [
    {
      tracked_prompt_id: 1,
      created_at: '2026-05-04T00:00:00.000Z'
    }
  ]);

  assert.equal(performance[1].last_run_at, '2026-05-04T00:00:00.000Z');
  assert.equal(performance[1].total_runs, 0);
  assert.equal(performance[1].completed_runs, 0);
  assert.equal(performance[1].failed_runs, 0);
});

test('tracks prompt run failures separately from effective metric checks', () => {
  const performance = ProjectMetricsService.buildPromptPerformance([
    { id: 1, question: '静音轮胎怎么选', enabled: true }
  ], [], [
    {
      tracked_prompt_id: 1,
      status: 'failed',
      created_at: '2026-05-03T00:00:00.000Z'
    },
    {
      tracked_prompt_id: 1,
      status: 'completed',
      created_at: '2026-05-04T00:00:00.000Z'
    }
  ]);

  assert.equal(performance[1].checks, 0);
  assert.equal(performance[1].total_runs, 2);
  assert.equal(performance[1].failed_runs, 1);
  assert.equal(performance[1].completed_runs, 1);
  assert.equal(performance[1].last_run_at, '2026-05-04T00:00:00.000Z');
});

test('builds calendar-complete trend rows for the selected period', () => {
  const trend = ProjectMetricsService.buildTrend([
    {
      created_at: '2026-05-14T10:00:00.000+08:00',
      brand_mentioned: true,
      share_of_voice: 80,
      citation_count: 1,
      brand_recommended: true
    }
  ], 3, {
    referenceDate: new Date('2026-05-15T12:00:00.000+08:00')
  });

  assert.deepEqual(trend, [
    { date: '2026-05-13', checks: 0, brand_mention_rate: 0, avg_share_of_voice: 0, citation_rate: 0, recommendation_rate: 0 },
    { date: '2026-05-14', checks: 1, brand_mention_rate: 100, avg_share_of_voice: 80, citation_rate: 100, recommendation_rate: 100 },
    { date: '2026-05-15', checks: 0, brand_mention_rate: 0, avg_share_of_voice: 0, citation_rate: 0, recommendation_rate: 0 }
  ]);
});

test('builds dashboard summary with prompt coverage and source analysis fields', () => {
  const summary = ProjectMetricsService.buildDashboardSummary({
    metrics: [
      {
        platform: 'deepseek',
        prompt_id: 1,
        brand_mentioned: true,
        share_of_voice: 80,
        citation_count: 1,
        owned_citation_count: 1,
        brand_recommended: true
      }
    ],
    records: [
      { status: 'completed' },
      { status: 'failed' }
    ],
    prompts: [
      { id: 1, enabled: true, category: '购买决策' }
    ],
    sourceAnalysis: {
      summary: { total_citations: 2, source_domain_count: 2 },
      source_types: [{ type: '自有来源', citation_count: 1 }],
      domains: [{ domain: 'brand.example.com', citation_count: 1 }],
      urls: [{ url: 'https://brand.example.com/guide', domain: 'brand.example.com', citation_count: 1 }],
      source_changes: { new_domains: [{ domain: 'new.example.com' }], dropped_domains: [] }
    }
  });

  assert.equal(summary.total_checks, 1);
  assert.equal(summary.total_runs, 2);
  assert.equal(summary.failed_runs, 1);
  assert.deepEqual(summary.categories, [
    {
      category: '购买决策',
      prompt_count: 1,
      enabled_prompt_count: 1,
      total_runs: 0,
      failed_runs: 0,
      failure_rate: 0,
      checks: 1,
      brand_mention_rate: 100,
      avg_share_of_voice: 80,
      citation_rate: 100,
      recommendation_rate: 100
    }
  ]);
  assert.deepEqual(summary.source_summary, { total_citations: 2, source_domain_count: 2 });
  assert.deepEqual(summary.source_types, [{ type: '自有来源', citation_count: 1 }]);
  assert.deepEqual(summary.source_domains, [{ domain: 'brand.example.com', citation_count: 1 }]);
  assert.deepEqual(summary.source_urls, [{ url: 'https://brand.example.com/guide', domain: 'brand.example.com', citation_count: 1 }]);
  assert.deepEqual(summary.source_changes, { new_domains: [{ domain: 'new.example.com' }], dropped_domains: [] });
});

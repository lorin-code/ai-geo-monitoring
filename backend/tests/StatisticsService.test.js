const test = require('node:test');
const assert = require('node:assert/strict');

const StatisticsService = require('../services/StatisticsService');

test('normalizes brand keywords for keyword statistics', () => {
  assert.deepEqual(StatisticsService.parseBrandKeywords(null), []);
  assert.deepEqual(StatisticsService.parseBrandKeywords(''), []);
  assert.deepEqual(
    StatisticsService.parseBrandKeywords('米其林， Michelin, 米其林,,米其林静音轮胎 '),
    ['米其林', 'Michelin', '米其林静音轮胎']
  );
});

test('builds keyword statistics without blank or missing keywords', () => {
  const rows = StatisticsService.buildKeywordStats([
    { brand_keywords: null, platform: 'doubao', created_at: new Date('2026-05-01') },
    { brand_keywords: '米其林，Michelin, 米其林', platform: 'deepseek', created_at: new Date('2026-05-02') },
    {
      brand_keywords: '米其林静音轮胎',
      platform: 'doubao',
      created_at: new Date('2026-05-03'),
      resultDetail: {
        recommendation_count: 2,
        exposure_rate: 50,
        recommendation_rate: 25
      }
    }
  ]);

  assert.deepEqual(rows.map(row => row.keyword), ['米其林', 'Michelin', '米其林静音轮胎']);
  assert.equal(rows[0].total_mentions, 1);
  assert.deepEqual(rows[0].platform_distribution, { deepseek: 1 });
  assert.equal(rows[2].total_recommendations, 2);
  assert.equal(rows[2].avg_exposure_rate, '50.00');
  assert.equal(rows[2].avg_recommendation_rate, '25.00');
});

test('builds keyword statistics from visibility metrics', () => {
  const rows = StatisticsService.buildKeywordStats([
    {
      brand_keywords: '米其林',
      platform: 'doubao',
      created_at: new Date('2026-05-01'),
      visibilityMetric: {
        brand_mentioned: true,
        brand_recommended: false,
        brand_mentions: 3
      }
    },
    {
      brand_keywords: '米其林',
      platform: 'deepseek',
      created_at: new Date('2026-05-02'),
      visibilityMetric: {
        brand_mentioned: false,
        brand_recommended: false,
        brand_mentions: 0
      }
    }
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].total_mentions, 2);
  assert.equal(rows[0].total_recommendations, 3);
  assert.equal(rows[0].avg_exposure_rate, '50.00');
  assert.equal(rows[0].avg_recommendation_rate, '0.00');
});

test('builds keyword statistics from actual stored keyword counts when available', () => {
  const rows = StatisticsService.buildKeywordStats([
    {
      brand_keywords: '米其林，Michelin, Pilot Sport 5',
      platform: 'doubao',
      created_at: new Date('2026-05-01'),
      result_summary: {
        keyword_counts: [
          { keyword: '米其林', count: 2 },
          { keyword: 'Pilot Sport 5', count: 1 }
        ]
      },
      visibilityMetric: {
        brand_mentioned: true,
        brand_recommended: true,
        brand_mentions: 3
      }
    }
  ]);

  assert.deepEqual(rows.map(row => row.keyword), ['米其林', 'Pilot Sport 5']);
  assert.equal(rows[0].total_mentions, 2);
  assert.equal(rows[1].total_mentions, 1);
  assert.equal(rows.some(row => row.keyword === 'Michelin'), false);
  assert.deepEqual(rows[0].platform_distribution, { doubao: 2 });
  assert.equal(rows[0].avg_exposure_rate, '100.00');
});

test('builds keyword statistics from stringified stored keyword counts', () => {
  const rows = StatisticsService.buildKeywordStats([
    {
      brand_keywords: '米其林，Michelin',
      platform: 'deepseek',
      created_at: new Date('2026-05-02'),
      result_summary: JSON.stringify({
        keyword_counts: [
          { keyword: 'Michelin', count: 2 }
        ]
      }),
      visibilityMetric: {
        brand_mentioned: true,
        brand_recommended: false,
        brand_mentions: 2
      }
    }
  ]);

  assert.deepEqual(rows.map(row => row.keyword), ['Michelin']);
  assert.equal(rows[0].total_mentions, 2);
});

test('merges duplicate stored keyword count rows case-insensitively', () => {
  const rows = StatisticsService.buildKeywordStats([
    {
      brand_keywords: 'GoodieAI',
      platform: 'doubao',
      created_at: new Date('2026-05-03'),
      result_summary: {
        keyword_counts: [
          { keyword: 'GoodieAI', count: 1 },
          { keyword: 'goodieai', count: 2 }
        ]
      }
    }
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].keyword, 'GoodieAI');
  assert.equal(rows[0].total_mentions, 3);
  assert.deepEqual(rows[0].platform_distribution, { doubao: 3 });
});

test('builds user average stats from visibility metrics', () => {
  const stats = StatisticsService.buildUserAverageStats([
    { brand_mentioned: true, brand_recommended: true, brand_mentions: 2 },
    { brand_mentioned: true, brand_recommended: false, brand_mentions: 1 },
    { brand_mentioned: false, brand_recommended: false, brand_mentions: 0 }
  ]);

  assert.deepEqual(stats, {
    avg_recommendation_rate: 33.33,
    avg_exposure_rate: 66.67,
    avg_recommendation_count: 1
  });
});

test('returns zero user average stats when no visibility metrics exist', () => {
  assert.deepEqual(StatisticsService.buildUserAverageStats([]), {
    avg_recommendation_rate: 0,
    avg_exposure_rate: 0,
    avg_recommendation_count: 0
  });
});

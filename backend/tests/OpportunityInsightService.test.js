const test = require('node:test');
const assert = require('node:assert/strict');

const OpportunityInsightService = require('../services/OpportunityInsightService');

test('builds prioritized optimization opportunities from prompt, metric and source signals', () => {
  const opportunities = OpportunityInsightService.build({
    prompts: [
      { id: 1, question: '静音轮胎怎么选', enabled: true, category: '购买决策' },
      { id: 2, question: '新能源车轮胎推荐', enabled: true, category: '购买决策' }
    ],
    promptPerformance: {
      1: {
        checks: 3,
        brand_mention_rate: 33.33,
        avg_share_of_voice: 20,
        citation_rate: 0,
        recommendation_rate: 0,
        negative_sentiment_count: 1,
        last_run_at: '2026-05-02T00:00:00.000Z'
      },
      2: {
        checks: 0,
        brand_mention_rate: 0,
        avg_share_of_voice: 0,
        citation_rate: 0,
        recommendation_rate: 0,
        negative_sentiment_count: 0,
        last_run_at: null
      }
    },
    metrics: [
      {
        prompt_id: 1,
        platform: 'deepseek',
        prompt_category: '购买决策',
        brand_mentioned: false,
        sentiment: 'negative',
        competitor_mentions: [{ name: '马牌', mentioned: true, mentions: 4 }],
        created_at: '2026-05-02T00:00:00.000Z'
      },
      {
        prompt_id: 1,
        platform: 'doubao',
        prompt_category: '购买决策',
        brand_mentioned: true,
        sentiment: 'negative',
        competitor_mentions: [],
        created_at: '2026-05-02T00:00:00.000Z'
      }
    ],
    sourceOpportunities: [
      {
        platform: 'deepseek',
        prompt_id: 1,
        prompt_category: '购买决策',
        domain: 'competitor.cn',
        url: 'https://competitor.cn/page',
        created_at: '2026-05-02T00:00:00.000Z'
      }
    ]
  });

  assert.equal(opportunities.some((item) => item.type === '低品牌可见度' && item.prompt_id === 1 && item.priority === 'high'), true);
  assert.equal(opportunities.some((item) => item.type === '未运行 Prompt' && item.prompt_id === 2 && item.priority === 'medium'), true);
  assert.equal(opportunities.some((item) => item.type === '竞品压制' && item.prompt_id === 1 && item.competitor === '马牌'), true);
  assert.equal(opportunities.some((item) => item.type === '负向情绪' && item.prompt_id === 1), true);
  assert.equal(opportunities.some((item) => item.type === '竞品来源缺口' && item.domain === 'competitor.cn'), true);
});

test('does not surface negative sentiment when the target brand is absent', () => {
  const opportunities = OpportunityInsightService.build({
    prompts: [],
    promptPerformance: {},
    metrics: [
      {
        prompt_id: 1,
        platform: 'deepseek',
        prompt_category: '购买决策',
        brand_mentioned: false,
        sentiment: 'negative'
      }
    ]
  });

  assert.equal(opportunities.some((item) => item.type === '负向情绪'), false);
});

test('uses stored sentiment reasons and risk terms in negative sentiment opportunities', () => {
  const opportunities = OpportunityInsightService.build({
    prompts: [],
    promptPerformance: {},
    metrics: [
      {
        prompt_id: 1,
        platform: 'deepseek',
        prompt_category: '购买决策',
        brand_mentioned: true,
        sentiment: 'negative',
        sentiment_reason: '价格和售后风险',
        sentiment_risk_terms: ['价格高', '售后慢']
      }
    ]
  });

  const item = opportunities.find((row) => row.type === '负向情绪');
  assert.ok(item);
  assert.match(item.evidence, /价格和售后风险/);
  assert.match(item.evidence, /价格高、售后慢/);
});

test('hides provider details from negative sentiment opportunity evidence', () => {
  const opportunities = OpportunityInsightService.build({
    prompts: [],
    promptPerformance: {},
    metrics: [
      {
        prompt_id: 1,
        platform: 'deepseek',
        prompt_category: '购买决策',
        brand_mentioned: true,
        sentiment: 'negative',
        sentiment_reason: 'DeepSeek API 判断价格和售后风险，需要继续观察',
        sentiment_risk_terms: ['DeepSeek API 价格高', 'API Key 配置异常']
      }
    ]
  });

  const item = opportunities.find((row) => row.type === '负向情绪');
  assert.ok(item);
  assert.match(item.evidence, /判断价格和售后风险/);
  assert.match(item.evidence, /价格高、配置异常/);
  assert.doesNotMatch(item.evidence, /DeepSeek|API|Key/i);
});

test('uses the selected analysis window in unrun prompt evidence', () => {
  const opportunities = OpportunityInsightService.build({
    days: 7,
    prompts: [
      { id: 1, question: '静音轮胎怎么选', enabled: true, category: '购买决策' }
    ],
    promptPerformance: {
      1: { checks: 0 }
    },
    metrics: []
  });

  assert.equal(opportunities[0].type, '未运行 Prompt');
  assert.match(opportunities[0].evidence, /近 7 天/);
});

test('derives opportunity categories from prompt tags when category is not stored', () => {
  const opportunities = OpportunityInsightService.build({
    days: 7,
    prompts: [
      { id: 1, question: '静音轮胎怎么选', tags: ['购买决策'], enabled: true }
    ],
    promptPerformance: {
      1: { checks: 0 }
    },
    metrics: []
  });

  assert.equal(opportunities[0].type, '未运行 Prompt');
  assert.equal(opportunities[0].prompt_category, '购买决策');
});

test('normalizes stored metric and source categories in opportunity rows', () => {
  const opportunities = OpportunityInsightService.build({
    prompts: [
      { id: 1, question: '马牌和米其林哪个好', enabled: true },
      { id: 2, question: '静音轮胎怎么选', enabled: true }
    ],
    promptPerformance: {
      1: { checks: 3, brand_mention_rate: 80, avg_share_of_voice: 50, citation_rate: 50 },
      2: { checks: 4, brand_mention_rate: 50, avg_share_of_voice: 40, citation_rate: 50 }
    },
    metrics: [
      {
        prompt_id: 1,
        platform: 'deepseek',
        prompt_category: '历史脏分类',
        brand_mentioned: true,
        sentiment: 'negative',
        visibility_score: 2,
        competitor_mentions: [{ name: '马牌', mentioned: true, mentions: 2, visibility_score: 5 }]
      },
      { prompt_id: 2, platform: 'doubao', prompt_category: '旧分类', brand_mentioned: true },
      { prompt_id: 2, platform: 'doubao', prompt_category: '旧分类', brand_mentioned: true },
      { prompt_id: 2, platform: 'deepseek', prompt_category: '旧分类', brand_mentioned: false },
      { prompt_id: 2, platform: 'deepseek', prompt_category: '旧分类', brand_mentioned: false }
    ],
    sourceOpportunities: [
      {
        platform: 'deepseek',
        prompt_id: 1,
        prompt_category: '来源脏分类',
        domain: 'competitor.cn',
        brand_mentioned: true
      }
    ]
  });

  const dirty = opportunities.filter((item) => /脏分类|旧分类/.test(item.prompt_category || ''));
  assert.deepEqual(dirty, []);
  assert.equal(opportunities.some((item) => item.type === '竞品压制' && item.prompt_category === '竞品对比'), true);
  assert.equal(opportunities.some((item) => item.type === '负向情绪' && item.prompt_category === '竞品对比'), true);
  assert.equal(opportunities.some((item) => item.type === '竞品来源缺口' && item.prompt_category === '竞品对比'), true);
  assert.equal(opportunities.some((item) => item.type === '平台表现差距' && item.prompt_category === '购买决策'), true);
});

test('surfaces failed prompt runs instead of treating them as unrun', () => {
  const opportunities = OpportunityInsightService.build({
    days: 7,
    prompts: [
      { id: 1, question: '静音轮胎怎么选', tags: ['购买决策'], enabled: true }
    ],
    promptPerformance: {
      1: { checks: 0, total_runs: 2, failed_runs: 2, last_run_at: '2026-05-04T00:00:00.000Z' }
    },
    metrics: []
  });

  assert.equal(opportunities.some((item) => item.type === '未运行 Prompt'), false);
  const failure = opportunities.find((item) => item.type === '运行失败');
  assert.ok(failure);
  assert.equal(failure.priority, 'high');
  assert.equal(failure.prompt_category, '购买决策');
  assert.match(failure.evidence, /运行失败 2 次/);
});

test('surfaces completed prompt runs without metrics as missing analysis data', () => {
  const opportunities = OpportunityInsightService.build({
    days: 7,
    prompts: [
      { id: 1, question: '静音轮胎怎么选', tags: ['购买决策'], enabled: true }
    ],
    promptPerformance: {
      1: { checks: 0, total_runs: 2, completed_runs: 2, failed_runs: 0 }
    },
    metrics: []
  });

  assert.equal(opportunities.some((item) => item.type === '未运行 Prompt'), false);
  const missing = opportunities.find((item) => item.type === '分析数据缺失');
  assert.ok(missing);
  assert.equal(missing.priority, 'high');
  assert.match(missing.evidence, /运行 2 次但暂无有效分析数据/);
});

test('keeps opportunity recommendations user facing without internal pipeline wording', () => {
  const opportunities = OpportunityInsightService.build({
    days: 7,
    prompts: [
      { id: 1, question: '静音轮胎怎么选', tags: ['购买决策'], enabled: true },
      { id: 2, question: '新能源车轮胎推荐', tags: ['购买决策'], enabled: true }
    ],
    promptPerformance: {
      1: { checks: 0, total_runs: 2, completed_runs: 2, failed_runs: 0 },
      2: { checks: 0, total_runs: 2, completed_runs: 0, failed_runs: 2 }
    },
    metrics: []
  });

  const text = opportunities.map((item) => item.recommendation).join('\n');
  assert.doesNotMatch(text, /API|解析|入库|链路|调用错误/);
});

test('uses the selected analysis window in citation gap evidence', () => {
  const opportunities = OpportunityInsightService.build({
    days: 90,
    prompts: [
      { id: 1, question: '静音轮胎怎么选', enabled: true, category: '购买决策' }
    ],
    promptPerformance: {
      1: { checks: 3, brand_mention_rate: 80, avg_share_of_voice: 60, citation_rate: 0 }
    },
    metrics: []
  });

  const citationGap = opportunities.find((item) => item.type === '引用缺口');
  assert.ok(citationGap);
  assert.match(citationGap.evidence, /近 90 天/);
});

test('surfaces prompt level platform visibility gaps', () => {
  const opportunities = OpportunityInsightService.build({
    prompts: [
      { id: 1, question: '静音轮胎怎么选', enabled: true, category: '购买决策' }
    ],
    promptPerformance: {
      1: { checks: 4, brand_mention_rate: 50, avg_share_of_voice: 40, citation_rate: 50 }
    },
    metrics: [
      { prompt_id: 1, platform: 'doubao', prompt_category: '购买决策', brand_mentioned: true },
      { prompt_id: 1, platform: 'doubao', prompt_category: '购买决策', brand_mentioned: true },
      { prompt_id: 1, platform: 'deepseek', prompt_category: '购买决策', brand_mentioned: false },
      { prompt_id: 1, platform: 'deepseek', prompt_category: '购买决策', brand_mentioned: false }
    ]
  });

  const gap = opportunities.find((item) => item.type === '平台表现差距');
  assert.ok(gap);
  assert.equal(gap.prompt_id, 1);
  assert.equal(gap.platform, 'deepseek');
  assert.match(gap.evidence, /豆包提及率 100%/);
  assert.match(gap.evidence, /DeepSeek提及率 0%/);
});

test('surfaces significant prompt platform visibility gaps even when the weaker platform is not zero', () => {
  const opportunities = OpportunityInsightService.build({
    prompts: [
      { id: 1, question: '静音轮胎怎么选', enabled: true, category: '购买决策' }
    ],
    promptPerformance: {
      1: { checks: 4, brand_mention_rate: 75, avg_share_of_voice: 55, citation_rate: 50 }
    },
    metrics: [
      { prompt_id: 1, platform: 'doubao', prompt_category: '购买决策', brand_mentioned: true },
      { prompt_id: 1, platform: 'doubao', prompt_category: '购买决策', brand_mentioned: true },
      { prompt_id: 1, platform: 'deepseek', prompt_category: '购买决策', brand_mentioned: true },
      { prompt_id: 1, platform: 'deepseek', prompt_category: '购买决策', brand_mentioned: false }
    ]
  });

  const gap = opportunities.find((item) => item.type === '平台表现差距');
  assert.ok(gap);
  assert.equal(gap.prompt_id, 1);
  assert.equal(gap.platform, 'deepseek');
  assert.equal(gap.priority, 'medium');
  assert.match(gap.evidence, /豆包提及率 100%/);
  assert.match(gap.evidence, /DeepSeek提及率 50%/);
});

test('does not surface platform gaps before each platform has enough samples', () => {
  const opportunities = OpportunityInsightService.build({
    prompts: [
      { id: 1, question: '静音轮胎怎么选', enabled: true, category: '购买决策' }
    ],
    promptPerformance: {
      1: { checks: 2, brand_mention_rate: 50, avg_share_of_voice: 40, citation_rate: 50 }
    },
    metrics: [
      { prompt_id: 1, platform: 'doubao', prompt_category: '购买决策', brand_mentioned: true },
      { prompt_id: 1, platform: 'deepseek', prompt_category: '购买决策', brand_mentioned: false }
    ]
  });

  assert.equal(opportunities.some((item) => item.type === '平台表现差距'), false);
});

test('surfaces missing effective samples for a monitored prompt platform', () => {
  const opportunities = OpportunityInsightService.build({
    projectPlatforms: ['doubao', 'deepseek'],
    prompts: [
      { id: 1, question: '静音轮胎怎么选', enabled: true, category: '购买决策', platforms: ['doubao', 'deepseek'] }
    ],
    promptPerformance: {
      1: { checks: 2, brand_mention_rate: 100, avg_share_of_voice: 80, citation_rate: 50 }
    },
    metrics: [
      { prompt_id: 1, platform: 'doubao', prompt_category: '购买决策', brand_mentioned: true },
      { prompt_id: 1, platform: 'doubao', prompt_category: '购买决策', brand_mentioned: true }
    ]
  });

  const missing = opportunities.find((item) => item.type === '平台样本缺失');
  assert.ok(missing);
  assert.equal(missing.prompt_id, 1);
  assert.equal(missing.platform, 'deepseek');
  assert.match(missing.evidence, /DeepSeek暂无有效分析样本/);
});

test('does not assume missing platform samples when project platforms are unavailable', () => {
  const opportunities = OpportunityInsightService.build({
    prompts: [
      { id: 1, question: '静音轮胎怎么选', enabled: true, category: '购买决策' }
    ],
    promptPerformance: {
      1: { checks: 2, brand_mention_rate: 100, avg_share_of_voice: 80, citation_rate: 50 }
    },
    metrics: [
      { prompt_id: 1, platform: 'doubao', prompt_category: '购买决策', brand_mentioned: true },
      { prompt_id: 1, platform: 'doubao', prompt_category: '购买决策', brand_mentioned: true }
    ]
  });

  assert.equal(opportunities.some((item) => item.type === '平台样本缺失'), false);
});

test('surfaces competitor suppression when a competitor outranks a mentioned brand', () => {
  const opportunities = OpportunityInsightService.build({
    prompts: [],
    promptPerformance: {},
    metrics: [
      {
        prompt_id: 1,
        platform: 'deepseek',
        prompt_category: '竞品对比',
        brand_mentioned: true,
        brand_mentions: 1,
        visibility_score: 2,
        competitor_mentions: [
          { name: '马牌', mentioned: true, mentions: 3, visibility_score: 5 }
        ]
      }
    ]
  });

  const suppression = opportunities.find((item) => item.type === '竞品压制');
  assert.ok(suppression);
  assert.equal(suppression.competitor, '马牌');
  assert.match(suppression.evidence, /高于品牌/);
});

test('uses competitor visibility score before mention count for suppression evidence', () => {
  const opportunities = OpportunityInsightService.build({
    prompts: [],
    promptPerformance: {},
    metrics: [
      {
        prompt_id: 1,
        platform: 'doubao',
        prompt_category: '竞品对比',
        brand_mentioned: true,
        visibility_score: 3,
        competitor_mentions: [
          { name: '提及多竞品', mentioned: true, mentions: 5, visibility_score: 2 },
          { name: '推荐强竞品', mentioned: true, mentions: 1, visibility_score: 6 }
        ]
      }
    ]
  });

  const suppression = opportunities.find((item) => item.type === '竞品压制');
  assert.ok(suppression);
  assert.equal(suppression.competitor, '推荐强竞品');
});

test('describes competitor source gaps differently when the brand is mentioned', () => {
  const opportunities = OpportunityInsightService.build({
    prompts: [],
    promptPerformance: {},
    metrics: [],
    sourceOpportunities: [
      {
        platform: 'doubao',
        prompt_id: 1,
        prompt_category: '竞品对比',
        domain: 'competitor.cn',
        url: 'https://competitor.cn/page',
        brand_mentioned: true
      }
    ]
  });

  const gap = opportunities.find((item) => item.type === '竞品来源缺口');
  assert.ok(gap);
  assert.match(gap.evidence, /未引用品牌自有来源/);
});

test('surfaces prompts with too few samples even when the first result is positive', () => {
  const opportunities = OpportunityInsightService.build({
    days: 30,
    prompts: [
      { id: 1, question: '新能源车轮胎推荐', enabled: true, category: '购买决策' }
    ],
    promptPerformance: {
      1: { checks: 1, brand_mention_rate: 100, avg_share_of_voice: 80, citation_rate: 100 }
    },
    metrics: [
      { prompt_id: 1, platform: 'doubao', prompt_category: '购买决策', brand_mentioned: true }
    ]
  });

  const lowSample = opportunities.find((item) => item.type === '样本不足');
  assert.ok(lowSample);
  assert.equal(lowSample.prompt_id, 1);
  assert.match(lowSample.evidence, /近 30 天仅 1 次有效分析/);
});

test('does not classify low visibility before enough prompt samples exist', () => {
  const opportunities = OpportunityInsightService.build({
    days: 30,
    prompts: [
      { id: 1, question: '新能源车轮胎推荐', enabled: true, category: '购买决策' }
    ],
    promptPerformance: {
      1: { checks: 1, brand_mention_rate: 0, avg_share_of_voice: 0, citation_rate: 0 }
    },
    metrics: [
      { prompt_id: 1, platform: 'doubao', prompt_category: '购买决策', brand_mentioned: false }
    ]
  });

  assert.equal(opportunities.some((item) => item.type === '样本不足'), true);
  assert.equal(opportunities.some((item) => item.type === '低品牌可见度'), false);
});

test('does not classify citation gaps before enough prompt samples exist', () => {
  const opportunities = OpportunityInsightService.build({
    days: 30,
    prompts: [
      { id: 1, question: '新能源车轮胎推荐', enabled: true, category: '购买决策' }
    ],
    promptPerformance: {
      1: { checks: 2, brand_mention_rate: 50, avg_share_of_voice: 40, citation_rate: 0 }
    },
    metrics: [
      { prompt_id: 1, platform: 'doubao', prompt_category: '购买决策', brand_mentioned: true },
      { prompt_id: 1, platform: 'deepseek', prompt_category: '购买决策', brand_mentioned: false }
    ]
  });

  assert.equal(opportunities.some((item) => item.type === '样本不足'), true);
  assert.equal(opportunities.some((item) => item.type === '引用缺口'), false);
});

test('does not surface optimization opportunities for disabled prompts', () => {
  const opportunities = OpportunityInsightService.build({
    prompts: [
      { id: 1, question: '新能源车轮胎推荐', enabled: false, category: '购买决策' }
    ],
    promptPerformance: {
      1: { checks: 4, brand_mention_rate: 0, avg_share_of_voice: 0, citation_rate: 0 }
    },
    metrics: [
      {
        prompt_id: 1,
        platform: 'doubao',
        prompt_category: '购买决策',
        brand_mentioned: false,
        sentiment: 'negative',
        competitor_mentions: [
          { name: '马牌', mentioned: true, mentions: 3, visibility_score: 5 }
        ]
      },
      {
        prompt_id: 1,
        platform: 'deepseek',
        prompt_category: '购买决策',
        brand_mentioned: true,
        sentiment: 'negative',
        competitor_mentions: []
      }
    ],
    sourceOpportunities: [
      {
        platform: 'doubao',
        prompt_id: 1,
        prompt_category: '购买决策',
        domain: 'competitor.cn',
        url: 'https://competitor.cn/page',
        brand_mentioned: true
      }
    ]
  });

  assert.deepEqual(opportunities.filter((item) => item.prompt_id === 1), []);
});

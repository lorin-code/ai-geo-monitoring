const test = require('node:test');
const assert = require('node:assert/strict');

const AIPlatformService = require('../services/AIPlatformService');
const SentimentAnalysisService = require('../services/SentimentAnalysisService');

test('parses structured sentiment analysis from fenced DeepSeek output', () => {
  const result = SentimentAnalysisService.parseAnalysis('```json\n{"sentiment":"negative","reason":"回答认为品牌价格高且不推荐","risk_terms":["价格高","不推荐"]}\n```');

  assert.deepEqual(result, {
    sentiment: 'negative',
    reason: '回答认为品牌价格高且不推荐',
    risk_terms: ['价格高', '不推荐']
  });
});

test('normalizes invalid sentiment analysis to neutral', () => {
  const result = SentimentAnalysisService.parseAnalysis('{"sentiment":"mixed","reason":"态度不明确"}');

  assert.deepEqual(result, {
    sentiment: 'neutral',
    reason: '态度不明确',
    risk_terms: []
  });
});

test('normalizes Chinese sentiment labels from DeepSeek output', () => {
  const result = SentimentAnalysisService.parseAnalysis(JSON.stringify({
    sentiment: '负向',
    reason: '回答明确不推荐该品牌',
    risk_terms: '不推荐、价格高'
  }));

  assert.deepEqual(result, {
    sentiment: 'negative',
    reason: '回答明确不推荐该品牌',
    risk_terms: ['不推荐', '价格高']
  });
});

test('normalizes qualified Chinese sentiment labels from DeepSeek output', () => {
  assert.equal(SentimentAnalysisService.parseAnalysis('{"sentiment":"偏负面","reason":"多处提到风险"}').sentiment, 'negative');
  assert.equal(SentimentAnalysisService.parseAnalysis('{"sentiment":"整体正面","reason":"认可品牌优势"}').sentiment, 'positive');
  assert.equal(SentimentAnalysisService.parseAnalysis('{"sentiment":"中性偏负","reason":"信息客观但有顾虑"}').sentiment, 'negative');
});

test('keeps parsed sentiment reasons short and provider-neutral', () => {
  const result = SentimentAnalysisService.parseAnalysis(JSON.stringify({
    sentiment: 'negative',
    reason: 'DeepSeek API 返回内容显示这个品牌在价格、耐磨和售后方面存在很多长期风险，需要继续观察',
    risk_terms: ['价格高']
  }));

  assert.equal(result.sentiment, 'negative');
  assert.equal(result.reason.length <= 20, true);
  assert.doesNotMatch(result.reason, /DeepSeek|API|Key/i);
});

test('keeps parsed sentiment risk terms short and provider-neutral', () => {
  const result = SentimentAnalysisService.parseAnalysis(JSON.stringify({
    sentiment: 'negative',
    reason: '多处提到风险',
    risk_terms: [
      'DeepSeek API 判断价格和售后存在明显长期风险',
      '售后慢',
      'API Key 配置异常'
    ]
  }));

  assert.deepEqual(result.risk_terms, [
    '判断价格和售后存在明显长期风',
    '售后慢',
    '配置异常'
  ]);
  assert.equal(result.risk_terms.every((item) => item.length <= 14), true);
  assert.equal(result.risk_terms.some((item) => /DeepSeek|API|Key/i.test(item)), false);
});

test('builds a DeepSeek sentiment prompt with brand and competitor context', () => {
  const prompt = SentimentAnalysisService.buildAnalysisQuestion({
    responseText: '米其林静音表现不错，但价格比马牌高。',
    brand: { name: '米其林', aliases: ['Michelin'], primary_keywords: ['Pilot Sport 5', '米其林轮胎'] },
    competitors: [{ name: '马牌', aliases: ['Continental'] }]
  });

  assert.match(prompt, /品牌：米其林/);
  assert.match(prompt, /品牌别名：Michelin/);
  assert.match(prompt, /品牌核心关键词：Pilot Sport 5、米其林轮胎/);
  assert.match(prompt, /主要竞品：马牌、Continental/);
  assert.match(prompt, /只返回 JSON 对象/);
});

test('falls back to neutral sentiment with user-facing reason when sentiment analysis fails', async () => {
  const originalQueryPlatform = AIPlatformService.queryPlatform;
  const originalApiKey = AIPlatformService.platforms.deepseek.apiKey;
  AIPlatformService.platforms.deepseek.apiKey = 'test-key';
  AIPlatformService.queryPlatform = async () => {
    throw new Error('network timeout');
  };

  try {
    const result = await SentimentAnalysisService.analyzeWithDeepSeek({
      responseText: '米其林表现不错。',
      brand: { name: '米其林' },
      competitors: []
    });

    assert.deepEqual(result, {
      sentiment: 'neutral',
      reason: '情绪判定暂不可用',
      risk_terms: []
    });
  } finally {
    AIPlatformService.queryPlatform = originalQueryPlatform;
    AIPlatformService.platforms.deepseek.apiKey = originalApiKey;
  }
});

test('does not expose provider configuration details when sentiment analysis is unavailable', async () => {
  const originalApiKey = AIPlatformService.platforms.deepseek.apiKey;
  AIPlatformService.platforms.deepseek.apiKey = '';

  try {
    const result = await SentimentAnalysisService.analyzeWithDeepSeek({
      responseText: '米其林表现不错。',
      brand: { name: '米其林' },
      competitors: []
    });

    assert.deepEqual(result, {
      sentiment: 'neutral',
      reason: '情绪判定暂不可用',
      risk_terms: []
    });
    assert.doesNotMatch(result.reason, /DeepSeek|API|Key/i);
  } finally {
    AIPlatformService.platforms.deepseek.apiKey = originalApiKey;
  }
});

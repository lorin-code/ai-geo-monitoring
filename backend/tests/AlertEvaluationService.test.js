const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Op } = require('sequelize');

const AlertEvaluationService = require('../services/AlertEvaluationService');

const servicePath = path.resolve(__dirname, '..', 'services', 'AlertEvaluationService.js');

test('normalizes alert thresholds by rule type', () => {
  assert.equal(AlertEvaluationService.normalizeThreshold('visibility_drop', 'abc'), 10);
  assert.equal(AlertEvaluationService.normalizeThreshold('visibility_drop', 150), 100);
  assert.equal(AlertEvaluationService.normalizeThreshold('citation_gap', -5), 0);
  assert.equal(AlertEvaluationService.normalizeThreshold('platform_gap', 101), 100);
  assert.equal(AlertEvaluationService.normalizeThreshold('competitor_ahead', 150), 150);
  assert.equal(AlertEvaluationService.normalizeThreshold('competitor_ahead', 1200), 1000);
  assert.equal(AlertEvaluationService.normalizeThreshold('negative_sentiment', 0), 1);
  assert.equal(AlertEvaluationService.normalizeThreshold('task_failure', 0), 1);
  assert.equal(AlertEvaluationService.normalizeThreshold('source_drop', '2.8'), 3);
});

test('resets alert threshold to the new type default when changing rule type without threshold', () => {
  const payload = AlertEvaluationService.buildRulePayload(
    { type: 'visibility_drop' },
    'competitor_ahead'
  );

  assert.deepEqual(payload, {
    type: 'visibility_drop',
    threshold: 10
  });
});

test('evaluates alert rules from recent metrics and failures', () => {
  const decisions = AlertEvaluationService.evaluateRules([
    { id: 1, type: 'visibility_drop', threshold: 60, enabled: true },
    { id: 2, type: 'competitor_ahead', threshold: 1, enabled: true },
    { id: 3, type: 'negative_sentiment', threshold: 50, enabled: true },
    { id: 4, type: 'task_failure', threshold: 2, enabled: true },
    { id: 5, type: 'citation_gap', threshold: 30, enabled: true },
    { id: 6, type: 'source_drop', threshold: 1, enabled: true },
    { id: 7, type: 'platform_gap', threshold: 80, enabled: true }
  ], {
    total_checks: 4,
    brand_mentioned_checks: 4,
    brand_mention_rate: 50,
    avg_share_of_voice: 35,
    citation_rate: 10,
    negative_sentiment_rate: 50,
    competitors: [{ name: 'DeepSeek', mentions: 3, appeared_checks: 2 }],
    platforms: [
      { platform: 'doubao', checks: 2, brand_mention_rate: 100 },
      { platform: 'deepseek', checks: 2, brand_mention_rate: 0 }
    ]
  }, {
    failed_checks: 2,
    dropped_source_domains: 1
  });

  assert.deepEqual(decisions.map((item) => item.rule_id), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(decisions[0].value, 35);
  assert.match(decisions[1].message, /DeepSeek/);
  assert.equal(decisions[3].value, 2);
  assert.match(decisions[4].message, /引用率/);
  assert.match(decisions[5].message, /流失引用域名/);
  assert.match(decisions[6].message, /平台提及率差距/);
});

test('project alert evaluation only reads data from the project monitoring platforms', () => {
  const source = fs.readFileSync(servicePath, 'utf8');

  assert.match(source, /PlatformSelectionService/);
  assert.match(source, /const projectPlatforms = PlatformSelectionService\.normalize\(projectData\.platforms\)/);
  assert.equal((source.match(/platform: \{ \[Op\.in\]: projectPlatforms \}/g) || []).length, 3);
  assert.match(source, /QuestionRecord\.count\(\{[\s\S]*platform: \{ \[Op\.in\]: projectPlatforms \}/);
  assert.match(source, /dropped_source_urls:\s*sourceAnalysis\.source_changes\.dropped_urls\.length/);
  assert.equal(typeof Op.in, 'symbol');
});

test('triggers visibility drop when SOV is zero but mention rate is above threshold', () => {
  const decisions = AlertEvaluationService.evaluateRules([
    { id: 1, type: 'visibility_drop', threshold: 20, enabled: true }
  ], {
    total_checks: 5,
    brand_mention_rate: 80,
    avg_share_of_voice: 0,
    competitors: []
  });

  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].value, 0);
  assert.match(decisions[0].message, /声量占比（SOV）0%/);
});

test('does not trigger negative sentiment alerts when the normalized threshold is above zero and no negative answers exist', () => {
  const decisions = AlertEvaluationService.evaluateRules([
    { id: 1, type: 'negative_sentiment', threshold: 0, enabled: true }
  ], {
    total_checks: 3,
    negative_sentiment_rate: 0
  });

  assert.deepEqual(decisions, []);
});

test('does not trigger negative sentiment alerts before enough brand-mentioned samples exist', () => {
  const decisions = AlertEvaluationService.evaluateRules([
    { id: 1, type: 'negative_sentiment', threshold: 50, enabled: true }
  ], {
    total_checks: 3,
    brand_mentioned_checks: 1,
    negative_sentiment_rate: 100
  });

  assert.deepEqual(decisions, []);
});

test('triggers negative sentiment alerts after enough brand-mentioned samples exist', () => {
  const decisions = AlertEvaluationService.evaluateRules([
    { id: 1, type: 'negative_sentiment', threshold: 50, enabled: true }
  ], {
    total_checks: 3,
    brand_mentioned_checks: 3,
    negative_sentiment_rate: 66.67
  });

  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].type, 'negative_sentiment');
  assert.match(decisions[0].message, /品牌提及回答/);
});

test('triggers source drop alerts from lost citation urls even when domains are retained', () => {
  const decisions = AlertEvaluationService.evaluateRules([
    { id: 1, type: 'source_drop', threshold: 2, enabled: true }
  ], {
    total_checks: 3
  }, {
    dropped_source_domains: 0,
    dropped_source_urls: 2
  });

  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].type, 'source_drop');
  assert.equal(decisions[0].value, 2);
  assert.match(decisions[0].message, /流失引用 URL/);
});

test('triggers competitor ahead from visibility score even when mentions are lower', () => {
  const decisions = AlertEvaluationService.evaluateRules([
    { id: 1, type: 'competitor_ahead', threshold: 1, enabled: true }
  ], {
    total_checks: 3,
    competitors: [
      { name: '马牌', mentions: 1, appeared_checks: 1, visibility_score: 6 }
    ]
  }, {
    brand_mentions: 4,
    brand_visibility_score: 3
  });

  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].type, 'competitor_ahead');
  assert.equal(decisions[0].value, 3);
  assert.match(decisions[0].message, /可见度得分/);
});

test('uses competitor ahead threshold as the score gap over the brand', () => {
  const belowGap = AlertEvaluationService.evaluateRules([
    { id: 1, type: 'competitor_ahead', threshold: 4, enabled: true }
  ], {
    total_checks: 3,
    competitors: [
      { name: '马牌', mentions: 1, appeared_checks: 1, visibility_score: 6 }
    ]
  }, {
    brand_mentions: 4,
    brand_visibility_score: 3
  });
  const atGap = AlertEvaluationService.evaluateRules([
    { id: 1, type: 'competitor_ahead', threshold: 3, enabled: true }
  ], {
    total_checks: 3,
    competitors: [
      { name: '马牌', mentions: 1, appeared_checks: 1, visibility_score: 6 }
    ]
  }, {
    brand_mentions: 4,
    brand_visibility_score: 3
  });

  assert.deepEqual(belowGap, []);
  assert.equal(atGap.length, 1);
  assert.equal(atGap[0].value, 3);
  assert.match(atGap[0].message, /领先 3 分/);
});

test('does not trigger metric-based alerts without effective analysis data', () => {
  const decisions = AlertEvaluationService.evaluateRules([
    { id: 1, type: 'visibility_drop', threshold: 20, enabled: true },
    { id: 2, type: 'citation_gap', threshold: 30, enabled: true },
    { id: 3, type: 'negative_sentiment', threshold: 0, enabled: true },
    { id: 4, type: 'task_failure', threshold: 1, enabled: true },
    { id: 5, type: 'source_drop', threshold: 1, enabled: true }
  ], {
    total_checks: 0,
    brand_mention_rate: 0,
    avg_share_of_voice: 0,
    citation_rate: 0,
    negative_sentiment_rate: 0,
    competitors: []
  }, {
    failed_checks: 1,
    dropped_source_domains: 3
  });

  assert.deepEqual(decisions.map((item) => item.rule_id), [4]);
});

test('does not trigger metric-based alerts before enough effective samples exist', () => {
  const decisions = AlertEvaluationService.evaluateRules([
    { id: 1, type: 'visibility_drop', threshold: 60, enabled: true },
    { id: 2, type: 'citation_gap', threshold: 30, enabled: true },
    { id: 3, type: 'negative_sentiment', threshold: 50, enabled: true },
    { id: 4, type: 'platform_gap', threshold: 80, enabled: true },
    { id: 5, type: 'task_failure', threshold: 1, enabled: true },
    { id: 6, type: 'source_drop', threshold: 1, enabled: true }
  ], {
    total_checks: 2,
    brand_mention_rate: 0,
    avg_share_of_voice: 0,
    citation_rate: 0,
    negative_sentiment_rate: 100,
    platforms: [
      { platform: 'doubao', checks: 1, brand_mention_rate: 100 },
      { platform: 'deepseek', checks: 1, brand_mention_rate: 0 }
    ]
  }, {
    failed_checks: 1,
    dropped_source_domains: 2
  });

  assert.deepEqual(decisions.map((item) => item.rule_id), [5]);
});

test('does not trigger platform gap alerts before each platform has enough samples', () => {
  const decisions = AlertEvaluationService.evaluateRules([
    { id: 1, type: 'platform_gap', threshold: 80, enabled: true }
  ], {
    total_checks: 3,
    platforms: [
      { platform: 'doubao', checks: 2, brand_mention_rate: 100 },
      { platform: 'deepseek', checks: 1, brand_mention_rate: 0 }
    ]
  });

  assert.deepEqual(decisions, []);
});

test('does not trigger platform gap alerts when every platform has weak visibility', () => {
  const decisions = AlertEvaluationService.evaluateRules([
    { id: 1, type: 'platform_gap', threshold: 20, enabled: true }
  ], {
    total_checks: 4,
    platforms: [
      { platform: 'doubao', checks: 2, brand_mention_rate: 25 },
      { platform: 'deepseek', checks: 2, brand_mention_rate: 0 }
    ]
  });

  assert.deepEqual(decisions, []);
});

test('builds alert rule update payload with a changed type and matching threshold normalization', () => {
  const payload = AlertEvaluationService.buildRulePayload({
    type: 'platform_gap',
    threshold: 101,
    enabled: true
  }, 'task_failure');

  assert.deepEqual(payload, {
    type: 'platform_gap',
    threshold: 100,
    enabled: true
  });
});

test('rejects explicitly invalid alert rule types instead of silently falling back', () => {
  assert.throws(() => {
    AlertEvaluationService.buildRulePayload({ type: 'unknown_alert', threshold: 20 }, 'task_failure');
  }, (error) => {
    assert.equal(error.code, 'INVALID_ALERT_RULE_TYPE');
    assert.match(error.message, /不支持的告警类型/);
    return true;
  });
});

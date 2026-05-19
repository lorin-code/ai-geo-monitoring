const test = require('node:test');
const assert = require('node:assert/strict');

const VisibilityAnalysisService = require('../services/VisibilityAnalysisService');

test('analyzes brand and competitor visibility in an AI response', () => {
  const result = VisibilityAnalysisService.analyzeResponse({
    responseText: '如果关注性价比，DeepSeek 值得优先考虑。豆包在中文场景也很强，DeepSeek 的开发者生态更活跃。',
    brand: { name: '豆包', aliases: ['Doubao'] },
    competitors: [
      { id: 1, name: 'DeepSeek', aliases: ['深度求索'] }
    ]
  });

  assert.equal(result.brand_mentioned, true);
  assert.equal(result.brand_mentions, 1);
  assert.equal(result.brand_position, 2);
  assert.equal(result.competitor_mentions.length, 1);
  assert.equal(result.competitor_mentions[0].name, 'DeepSeek');
  assert.equal(result.competitor_mentions[0].mentions, 2);
  assert.equal(result.share_of_voice, 33.33);
});

test('does not treat recommendation wording in the previous sentence as brand recommendation', () => {
  const result = VisibilityAnalysisService.analyzeResponse({
    responseText: 'DeepSeek 值得买。豆包在中文场景也很强。',
    brand: { name: '豆包', aliases: ['Doubao'] },
    competitors: [
      { id: 1, name: 'DeepSeek', aliases: ['深度求索'] }
    ]
  });

  assert.equal(result.brand_mentioned, true);
  assert.equal(result.brand_recommended, false);
  assert.equal(result.competitor_mentions[0].recommended, true);
});

test('returns zero visibility when the brand and competitors are absent', () => {
  const result = VisibilityAnalysisService.analyzeResponse({
    responseText: '这个问题需要结合预算、产品定位和目标用户来判断。',
    brand: { name: '豆包', aliases: [] },
    competitors: [
      { id: 1, name: 'DeepSeek', aliases: [] }
    ]
  });

  assert.equal(result.brand_mentioned, false);
  assert.equal(result.brand_mentions, 0);
  assert.equal(result.brand_position, null);
  assert.deepEqual(result.competitor_mentions, [
    {
      id: 1,
      name: 'DeepSeek',
      mentions: 0,
      mentioned: false,
      first_index: -1,
      position: null,
      rank: null,
      recommended: false,
      visibility_score: 0
    }
  ]);
  assert.equal(result.share_of_voice, 0);
});

test('deduplicates aliases case-insensitively before counting mentions', () => {
  const result = VisibilityAnalysisService.analyzeResponse({
    responseText: 'DeepSeek 在开发者场景中很常见。',
    brand: { name: 'DeepSeek', aliases: ['deepseek', 'DEEPSEEK'] },
    competitors: []
  });

  assert.equal(result.brand_mentions, 1);
  assert.equal(result.share_of_voice, 100);
});

test('does not count competitor aliases that overlap with brand terms', () => {
  const result = VisibilityAnalysisService.analyzeResponse({
    responseText: '米其林静音轮胎适合家用车。',
    brand: { name: '米其林', aliases: ['Michelin'] },
    competitors: [
      { id: 1, name: '马牌', aliases: ['米其林'] }
    ]
  });

  assert.equal(result.brand_mentioned, true);
  assert.equal(result.brand_mentions, 1);
  assert.equal(result.competitor_mentions[0].mentioned, false);
  assert.equal(result.competitor_mentions[0].mentions, 0);
  assert.equal(result.share_of_voice, 100);
});

test('counts compact brand and competitor spellings as mentions', () => {
  const result = VisibilityAnalysisService.analyzeResponse({
    responseText: 'GoodieAI 适合做品牌可见度监测，DeepSeekV3 在开发场景更常见。',
    brand: { name: 'Goodie AI', aliases: [] },
    competitors: [
      { id: 1, name: 'DeepSeek V3', aliases: [] }
    ]
  });

  assert.equal(result.brand_mentioned, true);
  assert.equal(result.brand_mentions, 1);
  assert.equal(result.competitor_mentions[0].mentioned, true);
  assert.equal(result.competitor_mentions[0].mentions, 1);
  assert.equal(result.share_of_voice, 60);
});

test('counts ASCII brand names inside common model suffix spellings', () => {
  const result = VisibilityAnalysisService.analyzeResponse({
    responseText: 'DeepSeekR1 适合代码推理，豆包在内容生成上也稳定。',
    brand: { name: '豆包', aliases: [] },
    competitors: [
      { id: 1, name: 'DeepSeek', aliases: ['深度求索'] }
    ]
  });

  assert.equal(result.brand_mentions, 1);
  assert.equal(result.competitor_mentions[0].mentioned, true);
  assert.equal(result.competitor_mentions[0].mentions, 1);
  assert.equal(result.competitor_mentions[0].rank, 1);
  assert.equal(result.brand_rank, 2);
});

test('counts project brand keywords as brand mentions', () => {
  const result = VisibilityAnalysisService.analyzeResponse({
    responseText: 'GoodieAI GEO 适合做品牌在 AI 搜索里的可见度监测。',
    brand: { name: 'Goodie AI', aliases: [], primary_keywords: ['GoodieAI GEO'] },
    competitors: [
      { id: 2, name: 'DeepSeek', aliases: [] }
    ]
  });

  assert.equal(result.brand_mentioned, true);
  assert.equal(result.brand_mentions, 1);
  assert.equal(result.brand_position, 1);
  assert.equal(result.share_of_voice, 100);
});

test('counts model-like brand product keywords even when they do not include the brand name', () => {
  const result = VisibilityAnalysisService.analyzeResponse({
    responseText: 'Pilot Sport 5 的抓地表现不错，马牌 MC6 也常被拿来对比。',
    brand: { name: '米其林', aliases: ['Michelin'], primary_keywords: ['Pilot Sport 5'] },
    competitors: [
      { id: 1, name: '马牌', aliases: ['Continental'] }
    ]
  });

  assert.equal(result.brand_mentioned, true);
  assert.equal(result.brand_mentions, 1);
  assert.equal(result.share_of_voice > 0, true);
});

test('does not double count overlapping brand product keywords', () => {
  const result = VisibilityAnalysisService.analyzeResponse({
    responseText: '豆包大模型适合中文内容生产，DeepSeek 适合代码场景。',
    brand: { name: '豆包', aliases: [], primary_keywords: ['豆包大模型'] },
    competitors: [
      { id: 1, name: 'DeepSeek', aliases: [] }
    ]
  });

  assert.equal(result.brand_mentioned, true);
  assert.equal(result.brand_mentions, 1);
  assert.equal(result.competitor_mentions[0].mentions, 1);
  assert.equal(result.share_of_voice, 60);
});

test('does not count generic category keywords as brand mentions', () => {
  const result = VisibilityAnalysisService.analyzeResponse({
    responseText: '静音轮胎适合关注舒适性的家用车，马牌也有不错的产品线。',
    brand: { name: '米其林', aliases: ['Michelin'], primary_keywords: ['静音轮胎', '新能源车轮胎'] },
    competitors: [
      { id: 1, name: '马牌', aliases: ['Continental'] }
    ]
  });

  assert.equal(result.brand_mentioned, false);
  assert.equal(result.brand_mentions, 0);
  assert.equal(result.brand_rank, null);
  assert.equal(result.share_of_voice, 0);
});

test('does not count generic Chinese phrases that contain an ambiguous brand name', () => {
  const result = VisibilityAnalysisService.analyzeResponse({
    responseText: '理想情况下，家用 SUV 要结合预算、空间和售后服务综合判断，小鹏 G9 也可以对比。',
    brand: { name: '理想', aliases: ['Li Auto'], primary_keywords: ['理想 L9'] },
    competitors: [
      { id: 1, name: '小鹏', aliases: ['XPeng'] }
    ]
  });

  assert.equal(result.brand_mentioned, false);
  assert.equal(result.brand_mentions, 0);
  assert.equal(result.brand_rank, null);
  assert.equal(result.competitor_mentions[0].mentioned, true);
});

test('counts ambiguous Chinese brand names when attached to vehicle model context', () => {
  const result = VisibilityAnalysisService.analyzeResponse({
    responseText: '预算充足并且重视空间时，理想 L9 更适合家庭长途。',
    brand: { name: '理想', aliases: ['Li Auto'], primary_keywords: ['理想 L9'] },
    competitors: []
  });

  assert.equal(result.brand_mentioned, true);
  assert.equal(result.brand_mentions, 1);
  assert.equal(result.brand_rank, 1);
});

test('does not count fruit contexts as Apple brand mentions', () => {
  const result = VisibilityAnalysisService.analyzeResponse({
    responseText: '苹果怎么保存更久，建议放在阴凉通风处，不要和香蕉放一起。',
    brand: { name: '苹果', aliases: ['Apple'], primary_keywords: ['iPhone', '苹果手机'] },
    competitors: [
      { id: 1, name: '华为', aliases: ['Huawei'] }
    ]
  });

  assert.equal(result.brand_mentioned, false);
  assert.equal(result.brand_mentions, 0);
  assert.equal(result.brand_rank, null);
});

test('counts Apple brand mentions in phone and device contexts', () => {
  const result = VisibilityAnalysisService.analyzeResponse({
    responseText: '苹果手机适合重视系统生态的用户，华为在通信和影像上也很强。',
    brand: { name: '苹果', aliases: ['Apple'], primary_keywords: ['iPhone', '苹果手机'] },
    competitors: [
      { id: 1, name: '华为', aliases: ['Huawei'] }
    ]
  });

  assert.equal(result.brand_mentioned, true);
  assert.equal(result.brand_mentions, 1);
  assert.equal(result.brand_rank, 1);
});

test('does not count grain contexts as Xiaomi brand mentions', () => {
  const result = VisibilityAnalysisService.analyzeResponse({
    responseText: '小米粥怎么煮更粘稠，可以提前浸泡并小火慢熬。',
    brand: { name: '小米', aliases: ['Xiaomi'], primary_keywords: ['小米手机', '小米汽车'] },
    competitors: [
      { id: 1, name: '华为', aliases: ['Huawei'] }
    ]
  });

  assert.equal(result.brand_mentioned, false);
  assert.equal(result.brand_mentions, 0);
  assert.equal(result.brand_rank, null);
});

test('counts Xiaomi brand mentions in phone and car contexts', () => {
  const result = VisibilityAnalysisService.analyzeResponse({
    responseText: '小米汽车适合关注智能座舱的用户，华为系车型在辅助驾驶上也很强。',
    brand: { name: '小米', aliases: ['Xiaomi'], primary_keywords: ['小米手机', '小米汽车'] },
    competitors: [
      { id: 1, name: '华为', aliases: ['Huawei'] }
    ]
  });

  assert.equal(result.brand_mentioned, true);
  assert.equal(result.brand_mentions, 1);
  assert.equal(result.brand_rank, 1);
});

test('does not count food contexts as Doubao AI brand mentions', () => {
  const result = VisibilityAnalysisService.analyzeResponse({
    responseText: '豆包子怎么做更松软，可以用温水和面并控制发酵时间。',
    brand: { name: '豆包', aliases: ['Doubao'], primary_keywords: ['豆包大模型'] },
    competitors: [
      { id: 1, name: 'DeepSeek', aliases: [] }
    ]
  });

  assert.equal(result.brand_mentioned, false);
  assert.equal(result.brand_mentions, 0);
  assert.equal(result.brand_rank, null);
});

test('counts Doubao AI brand mentions in model contexts', () => {
  const result = VisibilityAnalysisService.analyzeResponse({
    responseText: '豆包大模型适合中文内容生成，DeepSeek 更适合代码推理。',
    brand: { name: '豆包', aliases: ['Doubao'], primary_keywords: ['豆包大模型'] },
    competitors: [
      { id: 1, name: 'DeepSeek', aliases: [] }
    ]
  });

  assert.equal(result.brand_mentioned, true);
  assert.equal(result.brand_mentions, 1);
  assert.equal(result.brand_rank, 1);
});

test('does not count generic mass-audience contexts as Volkswagen brand mentions', () => {
  const result = VisibilityAnalysisService.analyzeResponse({
    responseText: '这类车型适合大众用户，价格透明、维修方便，比小众品牌更容易接受。',
    brand: { name: '大众', aliases: ['Volkswagen'], primary_keywords: ['大众汽车', '大众 ID.3'] },
    competitors: [
      { id: 1, name: '丰田', aliases: ['Toyota'] }
    ]
  });

  assert.equal(result.brand_mentioned, false);
  assert.equal(result.brand_mentions, 0);
  assert.equal(result.brand_rank, null);
});

test('counts Volkswagen brand mentions in vehicle contexts', () => {
  const result = VisibilityAnalysisService.analyzeResponse({
    responseText: '大众汽车适合重视维修便利性的家庭用户，丰田在保值率上也稳定。',
    brand: { name: '大众', aliases: ['Volkswagen'], primary_keywords: ['大众汽车', '大众 ID.3'] },
    competitors: [
      { id: 1, name: '丰田', aliases: ['Toyota'] }
    ]
  });

  assert.equal(result.brand_mentioned, true);
  assert.equal(result.brand_mentions, 1);
  assert.equal(result.brand_rank, 1);
});

test('does not count generic modern-style contexts as Hyundai brand mentions', () => {
  const result = VisibilityAnalysisService.analyzeResponse({
    responseText: '现代设计更强调简洁和智能化，选车时还要看预算和售后。',
    brand: { name: '现代', aliases: ['Hyundai'], primary_keywords: ['现代汽车', '现代伊兰特'] },
    competitors: [
      { id: 1, name: '本田', aliases: ['Honda'] }
    ]
  });

  assert.equal(result.brand_mentioned, false);
  assert.equal(result.brand_mentions, 0);
  assert.equal(result.brand_rank, null);
});

test('counts Hyundai brand mentions in vehicle contexts', () => {
  const result = VisibilityAnalysisService.analyzeResponse({
    responseText: '现代汽车在入门家轿里性价比不错，本田保值率更强。',
    brand: { name: '现代', aliases: ['Hyundai'], primary_keywords: ['现代汽车', '现代伊兰特'] },
    competitors: [
      { id: 1, name: '本田', aliases: ['Honda'] }
    ]
  });

  assert.equal(result.brand_mentioned, true);
  assert.equal(result.brand_mentions, 1);
  assert.equal(result.brand_rank, 1);
});

test('computes weighted visibility from rank and recommendation intent', () => {
  const result = VisibilityAnalysisService.analyzeResponse({
    responseText: '首选米其林静音轮胎，抓地和静音都不错。马牌也可以作为备选。',
    brand: { name: '米其林', aliases: ['Michelin'], primary_keywords: ['米其林静音轮胎'] },
    competitors: [
      { id: 1, name: '马牌', aliases: ['Continental'] }
    ]
  });

  assert.equal(result.brand_mentioned, true);
  assert.equal(result.brand_recommended, true);
  assert.equal(result.brand_rank, 1);
  assert.equal(result.brand_position, 1);
  assert.equal(result.competitor_mentions[0].position, 2);
  assert.equal(result.competitor_mentions[0].rank, 2);
  assert.equal(result.visibility_score > result.competitor_mentions[0].visibility_score, true);
  assert.equal(result.share_of_voice > 50, true);
});

test('keeps competitor ranks separate when competitor ids are missing', () => {
  const result = VisibilityAnalysisService.analyzeResponse({
    responseText: '首选马牌，固特异也可以作为备选，米其林适合预算充足时考虑。',
    brand: { name: '米其林', aliases: ['Michelin'] },
    competitors: [
      { name: '马牌', aliases: ['Continental'] },
      { name: '固特异', aliases: ['Goodyear'] }
    ]
  });

  assert.equal(result.brand_rank, 3);
  assert.equal(result.competitor_mentions[0].name, '马牌');
  assert.equal(result.competitor_mentions[0].rank, 1);
  assert.equal(result.competitor_mentions[1].name, '固特异');
  assert.equal(result.competitor_mentions[1].rank, 2);
});

test('does not treat negated brand recommendation as recommended', () => {
  const result = VisibilityAnalysisService.analyzeResponse({
    responseText: '预算有限时不推荐米其林，可以优先选择马牌。',
    brand: { name: '米其林', aliases: ['Michelin'], primary_keywords: ['米其林轮胎'] },
    competitors: [
      { id: 1, name: '马牌', aliases: ['Continental'] }
    ]
  });

  assert.equal(result.brand_mentioned, true);
  assert.equal(result.brand_recommended, false);
  assert.equal(result.competitor_mentions[0].recommended, true);
});

test('does not treat softened negative recommendation wording as recommended', () => {
  const result = VisibilityAnalysisService.analyzeResponse({
    responseText: '预算敏感时不是很推荐米其林，可以优先看马牌和国产高端线。',
    brand: { name: '米其林', aliases: ['Michelin'], primary_keywords: ['米其林轮胎'] },
    competitors: [
      { id: 1, name: '马牌', aliases: ['Continental'] }
    ]
  });

  assert.equal(result.brand_mentioned, true);
  assert.equal(result.brand_recommended, false);
  assert.equal(result.competitor_mentions[0].recommended, true);
});

test('does not treat recommendation for another brand in the same sentence as target brand recommendation', () => {
  const result = VisibilityAnalysisService.analyzeResponse({
    responseText: '预算敏感时更推荐马牌，不推荐米其林。',
    brand: { name: '米其林', aliases: ['Michelin'], primary_keywords: ['米其林轮胎'] },
    competitors: [
      { id: 1, name: '马牌', aliases: ['Continental'] }
    ]
  });

  assert.equal(result.brand_mentioned, true);
  assert.equal(result.brand_recommended, false);
  assert.equal(result.competitor_mentions[0].recommended, true);
});

test('does not apply earlier same-sentence recommendation wording to a later merely-mentioned brand', () => {
  const result = VisibilityAnalysisService.analyzeResponse({
    responseText: '预算敏感时更推荐马牌，也可以考虑米其林。',
    brand: { name: '米其林', aliases: ['Michelin'] },
    competitors: [
      { id: 1, name: '马牌', aliases: ['Continental'] }
    ]
  });

  assert.equal(result.brand_mentioned, true);
  assert.equal(result.brand_recommended, false);
  assert.equal(result.competitor_mentions[0].recommended, true);
});

test('does not apply later same-sentence recommendation wording to an earlier merely-mentioned brand', () => {
  const result = VisibilityAnalysisService.analyzeResponse({
    responseText: '米其林也可以考虑，但更推荐马牌。',
    brand: { name: '米其林', aliases: ['Michelin'] },
    competitors: [
      { id: 1, name: '马牌', aliases: ['Continental'] }
    ]
  });

  assert.equal(result.brand_mentioned, true);
  assert.equal(result.brand_recommended, false);
  assert.equal(result.competitor_mentions[0].recommended, true);
});

test('does not apply a nearby negative recommendation phrase to another brand', () => {
  const result = VisibilityAnalysisService.analyzeResponse({
    responseText: '预算敏感时不推荐米其林，马牌也有噪音偏大的反馈。',
    brand: { name: '米其林', aliases: ['Michelin'] },
    competitors: [
      { id: 1, name: '马牌', aliases: ['Continental'] }
    ]
  });

  assert.equal(result.brand_recommended, false);
  assert.equal(result.competitor_mentions[0].recommended, false);
});

test('detects recommendation intent around later brand mentions, not only the first mention', () => {
  const result = VisibilityAnalysisService.analyzeResponse({
    responseText: '米其林、马牌、固特异都属于常见轮胎品牌，具体选择要看车型、预算、静音需求和售后覆盖。预算充足并且看重综合舒适性时，更推荐米其林。',
    brand: { name: '米其林', aliases: ['Michelin'] },
    competitors: [
      { id: 1, name: '马牌', aliases: ['Continental'] }
    ]
  });

  assert.equal(result.brand_mentioned, true);
  assert.equal(result.brand_mentions, 2);
  assert.equal(result.brand_recommended, true);
  assert.equal(result.competitor_mentions[0].recommended, false);
  assert.equal(result.visibility_score > result.competitor_mentions[0].visibility_score, true);
});

const test = require('node:test');
const assert = require('node:assert/strict');

const PromptCategoryService = require('../services/PromptCategoryService');

test('prioritizes specialized prompt intents before generic buying words', () => {
  assert.equal(PromptCategoryService.derive({
    question: 'DeepSeek 替代方案推荐',
    tags: []
  }), '替代方案');

  assert.equal(PromptCategoryService.derive({
    question: '轮胎售后问题值得买吗',
    tags: []
  }), '风险顾虑');
});

test('classifies common which-is-better questions as competitor comparison', () => {
  assert.equal(PromptCategoryService.derive({
    question: '马牌和米其林哪个好',
    tags: []
  }), '竞品对比');

  assert.equal(PromptCategoryService.derive({
    question: 'DeepSeek 和豆包哪个更适合内容团队',
    tags: []
  }), '竞品对比');

  assert.equal(PromptCategoryService.derive({
    question: '马牌和米其林有什么区别',
    tags: []
  }), '竞品对比');

  assert.equal(PromptCategoryService.derive({
    question: '马牌比米其林好吗',
    tags: []
  }), '竞品对比');

  assert.equal(PromptCategoryService.derive({
    question: '豆包 vs DeepSeek',
    tags: []
  }), '竞品对比');

  assert.equal(PromptCategoryService.derive({
    question: '豆包VSDeepSeek',
    tags: []
  }), '竞品对比');

  assert.equal(PromptCategoryService.derive({
    question: '豆包和DeepSeek优劣分析',
    tags: []
  }), '竞品对比');

  assert.equal(PromptCategoryService.derive({
    question: '豆包 PK DeepSeek',
    tags: []
  }), '竞品对比');

  assert.equal(PromptCategoryService.derive({
    question: '豆包PKDeepSeek',
    tags: []
  }), '竞品对比');

  assert.equal(PromptCategoryService.derive({
    question: 'AI品牌监测工具对标产品有哪些',
    tags: []
  }), '竞品对比');
});

test('classifies common value and affordability questions as pricing cost', () => {
  assert.equal(PromptCategoryService.derive({
    question: '新能源车轮胎哪个便宜',
    tags: []
  }), '价格成本');

  assert.equal(PromptCategoryService.derive({
    question: '米其林轮胎贵不贵',
    tags: []
  }), '价格成本');

  assert.equal(PromptCategoryService.derive({
    question: '静音轮胎性价比推荐',
    tags: []
  }), '价格成本');

  assert.equal(PromptCategoryService.derive({
    question: '米其林轮胎性价比好吗',
    tags: []
  }), '价格成本');
});

test('classifies list and ranking discovery questions as purchase decisions', () => {
  assert.equal(PromptCategoryService.derive({
    question: '新能源车轮胎排行榜',
    tags: []
  }), '购买决策');

  assert.equal(PromptCategoryService.derive({
    question: 'AI品牌监测工具排名',
    tags: []
  }), '购买决策');

  assert.equal(PromptCategoryService.derive({
    question: '静音轮胎前十名',
    tags: []
  }), '购买决策');
});

test('classifies trust and safety concern questions as risk concerns', () => {
  assert.equal(PromptCategoryService.derive({
    question: '米其林轮胎靠谱吗',
    tags: []
  }), '风险顾虑');

  assert.equal(PromptCategoryService.derive({
    question: '新能源车轮胎安全吗',
    tags: []
  }), '风险顾虑');

  assert.equal(PromptCategoryService.derive({
    question: '静音轮胎会不会翻车',
    tags: []
  }), '风险顾虑');
});

test('classifies fit and scenario questions as product fit', () => {
  assert.equal(PromptCategoryService.derive({
    question: '米其林轮胎适合 SUV 吗',
    tags: []
  }), '产品适配');

  assert.equal(PromptCategoryService.derive({
    question: '静音轮胎适合家用车吗',
    tags: []
  }), '产品适配');

  assert.equal(PromptCategoryService.derive({
    question: '新能源车轮胎看哪些参数',
    tags: []
  }), '产品适配');

  assert.equal(PromptCategoryService.derive({
    question: 'AI品牌监测适合中小企业吗',
    tags: []
  }), '产品适配');

  assert.equal(PromptCategoryService.derive({
    question: 'GEO工具适合内容团队吗',
    tags: []
  }), '产品适配');

  assert.equal(PromptCategoryService.derive({
    question: 'DeepSeek适合客服场景吗',
    tags: []
  }), '产品适配');
});

test('does not treat arbitrary prompt tags as dashboard categories', () => {
  assert.equal(PromptCategoryService.derive({
    question: '静音轮胎',
    tags: ['静音', 'SUV']
  }), '未分类');

  assert.equal(PromptCategoryService.derive({
    question: '静音轮胎',
    tags: ['购买决策', 'SUV']
  }), '购买决策');
});

test('does not trust arbitrary stored prompt category values', () => {
  assert.equal(PromptCategoryService.derive({
    question: '马牌和米其林哪个好',
    category: 'SUV 用户问题',
    tags: []
  }), '竞品对比');

  assert.equal(PromptCategoryService.derive({
    question: '静音轮胎',
    prompt_category: '历史脏分类',
    tags: []
  }), '未分类');
});

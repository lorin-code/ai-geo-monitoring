const test = require('node:test');
const assert = require('node:assert/strict');

const {
  filterPromptRows,
  normalizePromptPlatforms,
} = require('./promptListFilters.cjs');

test('filters prompts by question, tags, platform label and status text', () => {
  const rows = [
    { id: 1, question: '静音轮胎怎么选', tags: ['购买决策'], platforms: ['doubao'], enabled: true },
    { id: 2, question: '新能源车轮胎推荐', tags: ['产品适配'], platforms: ['deepseek'], enabled: false },
  ];

  assert.deepEqual(filterPromptRows(rows, { search: '静音' }).map((item) => item.id), [1]);
  assert.deepEqual(filterPromptRows(rows, { search: '产品适配' }).map((item) => item.id), [2]);
  assert.deepEqual(filterPromptRows(rows, { search: '豆包' }).map((item) => item.id), [1]);
  assert.deepEqual(filterPromptRows(rows, { search: 'deepseek' }).map((item) => item.id), [2]);
  assert.deepEqual(filterPromptRows(rows, { search: '已停用' }).map((item) => item.id), [2]);
});

test('filters prompts by selected monitoring platform', () => {
  const rows = [
    { id: 1, question: '静音轮胎怎么选', platforms: ['doubao'], enabled: true },
    { id: 2, question: '新能源车轮胎推荐', platforms: ['deepseek'], enabled: true },
    { id: 3, question: '轮胎品牌怎么选', platforms: [], enabled: true },
  ];

  assert.deepEqual(filterPromptRows(rows, { platform: 'doubao', projectPlatforms: ['doubao'] }).map((item) => item.id), [1, 3]);
  assert.deepEqual(filterPromptRows(rows, { platform: 'deepseek', projectPlatforms: ['doubao'] }).map((item) => item.id), [2]);
});

test('filters prompts by derived prompt category', () => {
  const rows = [
    { id: 1, question: '静音轮胎怎么选', category: '购买决策', tags: ['轮胎'], platforms: ['doubao'], enabled: true },
    { id: 2, question: '马牌和米其林哪个好', category: '竞品对比', tags: ['轮胎'], platforms: ['deepseek'], enabled: true },
  ];

  assert.deepEqual(filterPromptRows(rows, { category: '购买决策' }).map((item) => item.id), [1]);
  assert.deepEqual(filterPromptRows(rows, { search: '竞品对比' }).map((item) => item.id), [2]);
});

test('normalizes prompt platforms with project platform fallback', () => {
  assert.deepEqual(normalizePromptPlatforms([], ['deepseek']), ['deepseek']);
  assert.deepEqual(normalizePromptPlatforms(['unknown'], ['doubao']), ['doubao']);
  assert.deepEqual(normalizePromptPlatforms(['kimi'], ['doubao']), ['kimi']);
  assert.deepEqual(normalizePromptPlatforms(['doubao'], ['deepseek']), ['doubao']);
});

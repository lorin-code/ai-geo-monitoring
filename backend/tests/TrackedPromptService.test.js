const test = require('node:test');
const assert = require('node:assert/strict');

const TrackedPromptService = require('../services/TrackedPromptService');

test('normalizes prompt questions for duplicate detection', () => {
  assert.equal(
    TrackedPromptService.canonicalQuestion('  静音 轮胎怎么选？？ '),
    TrackedPromptService.canonicalQuestion('静音轮胎怎么选')
  );
  assert.equal(
    TrackedPromptService.canonicalQuestion('AI Search Optimization?'),
    TrackedPromptService.canonicalQuestion('ai search optimization')
  );
  assert.equal(
    TrackedPromptService.canonicalQuestion('1. 静音轮胎怎么选'),
    TrackedPromptService.canonicalQuestion('静音轮胎怎么选')
  );
  assert.equal(
    TrackedPromptService.canonicalQuestion('问题：静音轮胎怎么选'),
    TrackedPromptService.canonicalQuestion('静音轮胎怎么选')
  );
  assert.equal(
    TrackedPromptService.canonicalQuestion('静音轮胎，怎么选'),
    TrackedPromptService.canonicalQuestion('静音轮胎怎么选')
  );
  assert.equal(
    TrackedPromptService.canonicalQuestion('DeepSeek，豆包哪个更适合内容团队'),
    TrackedPromptService.canonicalQuestion('DeepSeek和豆包哪个更适合内容团队')
  );
});

test('finds duplicate prompts in the same project and ignores the edited row', () => {
  const rows = [
    { id: 1, question: '静音轮胎怎么选' },
    { id: 2, question: '新能源车轮胎推荐' }
  ];

  assert.deepEqual(TrackedPromptService.findDuplicateInRows('静音 轮胎怎么选？', rows), rows[0]);
  assert.equal(TrackedPromptService.findDuplicateInRows('静音轮胎怎么选', rows, 1), null);
});

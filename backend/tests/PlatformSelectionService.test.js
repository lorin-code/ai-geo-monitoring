const test = require('node:test');
const assert = require('node:assert/strict');

const PlatformSelectionService = require('../services/PlatformSelectionService');

test('rejects unsupported explicit monitoring platforms instead of silently defaulting', () => {
  const result = PlatformSelectionService.validate(['deepseek', 'kimi']);

  assert.equal(result.ok, false);
  assert.deepEqual(result.invalid_platforms, ['kimi']);
  assert.match(result.message, /豆包|DeepSeek/);
});

test('defaults empty monitoring platforms to mainland AI platforms', () => {
  const result = PlatformSelectionService.validate([]);

  assert.equal(result.ok, true);
  assert.deepEqual(result.platforms, ['doubao', 'deepseek']);
});

test('builds platform status only for mainland monitoring platforms', () => {
  const statuses = PlatformSelectionService.buildSupportedStatus({
    doubao: { name: '豆包', apiKey: 'doubao-key' },
    deepseek: { name: 'DeepSeek', apiKey: '' },
    kimi: { name: 'Kimi', apiKey: 'kimi-key' },
    qianwen: { name: '千问', apiKey: 'qianwen-key' }
  });

  assert.deepEqual(statuses.map((item) => item.platform), ['doubao', 'deepseek']);
  assert.deepEqual(statuses.map((item) => item.ok), [true, false]);
  assert.deepEqual(statuses.map((item) => item.message), ['平台服务凭证已配置', '平台服务凭证未配置']);
});

test('defaults prompt platforms to the selected project platforms', () => {
  const result = PlatformSelectionService.validateWithinProject(undefined, ['deepseek']);

  assert.equal(result.ok, true);
  assert.deepEqual(result.platforms, ['deepseek']);
});

test('rejects prompt platforms outside the selected project platforms', () => {
  const result = PlatformSelectionService.validateWithinProject(['doubao'], ['deepseek']);

  assert.equal(result.ok, false);
  assert.deepEqual(result.invalid_platforms, ['doubao']);
  assert.match(result.message, /项目监测平台/);
});

test('reconciles existing prompt platforms after project platform changes', () => {
  assert.deepEqual(
    PlatformSelectionService.reconcilePromptPlatforms(['doubao', 'deepseek'], ['deepseek']),
    ['deepseek']
  );

  assert.deepEqual(
    PlatformSelectionService.reconcilePromptPlatforms(['doubao'], ['deepseek']),
    ['deepseek']
  );

  assert.deepEqual(
    PlatformSelectionService.reconcilePromptPlatforms(['kimi'], ['doubao']),
    ['doubao']
  );
});

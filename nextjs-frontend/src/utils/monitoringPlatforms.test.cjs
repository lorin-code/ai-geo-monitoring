/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { resolveMonitoringPlatforms } = require('./monitoringPlatforms.cjs');

test('platform options accept a single provider and reject invalid configuration', () => {
  assert.deepEqual(resolveMonitoringPlatforms(' DeepSeek,deepseek '), ['deepseek']);
  assert.throws(() => resolveMonitoringPlatforms('other'), /NEXT_PUBLIC_MONITORING_PLATFORMS/);
});

test('supported labels include all four providers independently of legacy build flags', () => {
  const script = `
    const options = require('./monitoringPlatforms.cjs');
    const prompts = require('./promptListFilters.cjs');
    console.log(JSON.stringify({
      options: options.MONITORING_PLATFORM_OPTIONS,
      names: options.MONITORING_PLATFORM_NAMES,
      platforms: prompts.normalizePromptPlatforms([]),
    }));
  `;
  const result = JSON.parse(execFileSync(process.execPath, ['-e', script], {
    cwd: __dirname,
    env: { ...process.env, NEXT_PUBLIC_MONITORING_PLATFORMS: 'deepseek' },
    encoding: 'utf8',
    timeout: 10000,
  }));
  assert.deepEqual(result, {
    options: [{ value: 'doubao', label: '豆包' }, { value: 'deepseek', label: 'DeepSeek' }, { value: 'qianwen', label: '千问' }, { value: 'kimi', label: 'Kimi' }],
    names: '豆包、DeepSeek、千问、Kimi',
    platforms: ['doubao', 'deepseek', 'qianwen', 'kimi'],
  });
});

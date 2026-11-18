const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { getMonitoringPlatforms } = require('../config/monitoringPlatforms');

test('monitoring platform configuration is explicit and rejects unknown providers', () => {
  assert.deepEqual(getMonitoringPlatforms(' DeepSeek,deepseek '), ['deepseek']);
  assert.deepEqual(getMonitoringPlatforms(''), ['doubao', 'deepseek', 'qianwen', 'kimi']);
  assert.throws(() => getMonitoringPlatforms('deepseek,unknown'), /MONITORING_PLATFORMS/);
  assert.throws(() => getMonitoringPlatforms(',,'), /MONITORING_PLATFORMS/);
});

test('DeepSeek-only deployment restricts defaults, projects, schedules, status, and provider calls', () => {
  const script = `
    const assert = require('node:assert/strict');
    const platforms = require('./services/PlatformSelectionService');
    const ai = require('./services/AIPlatformService');
    const runs = require('./services/ProjectRunService');
    const scheduler = require('./services/SchedulerService');
    const models = require('./models');
    (async () => {
      assert.deepEqual(platforms.validate([]).platforms, ['deepseek']);
      assert.equal(platforms.validate(['doubao']).ok, false);
      assert.deepEqual(platforms.buildSupportedStatus(ai.platforms).map(p => p.platform), ['deepseek']);
      assert.deepEqual(ai.getAvailablePlatforms(), []);
      for (const name of ['BrandProject', 'TrackedPrompt', 'DetectionSchedule']) {
        assert.deepEqual(models[name].build().platforms, ['deepseek']);
      }
      const targets = runs.buildPromptTargets([{ id: 1, platforms: ['doubao', 'deepseek'] }]);
      assert.deepEqual(targets.map(target => target.platform), []);
      assert.deepEqual(scheduler.normalizeProjectMonitoring({}).platforms, ['deepseek']);
      let requests = 0;
      ai.requestPlatform = async () => { requests += 1; return { success: true }; };
      assert.equal((await ai.queryPlatform('doubao', 'test')).success, false);
      assert.equal(requests, 0);
      await models.sequelize.close();
    })().catch(error => { console.error(error); process.exitCode = 1; });
  `;
  execFileSync(process.execPath, ['-e', script], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: '',
      DB_STORAGE: ':memory:',
      MONITORING_PLATFORMS: 'deepseek',
      DOUBAO_API_KEY: 'test-doubao-key',
      DEEPSEEK_API_KEY: 'test-deepseek-key',
    },
    timeout: 10000,
  });
});

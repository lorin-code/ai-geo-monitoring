const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const routeSource = fs.readFileSync(path.resolve(__dirname, '../routes/schedules.js'), 'utf8');

test('legacy schedule route limits all platform selections to mainland monitoring platforms', () => {
  assert.match(routeSource, /MAINLAND_MONITORING_PLATFORMS/);
  assert.match(routeSource, /validatePlatformsWithinContext\(/);
  assert.match(routeSource, /defaultPlatformsForContext\(/);
  assert.match(routeSource, /定时任务平台必须包含在项目或 Prompt 的监测平台内/);
  assert.match(routeSource, /if \(!platformResult\.ok\)/);
  assert.match(routeSource, /AIPlatformService\.getAvailablePlatforms\(\)\.filter\(p => MAINLAND_MONITORING_PLATFORMS\.includes\(p\)\)/);
});

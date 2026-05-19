const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const routeSource = fs.readFileSync(path.resolve(__dirname, '../routes/detection.js'), 'utf8');

test('legacy detection json errors do not expose internal exception messages', () => {
  assert.doesNotMatch(routeSource, /error:\s*error\.message/);
});

test('legacy detection records store safe platform failure messages', () => {
  assert.match(routeSource, /SAFE_PLATFORM_FAILURE_MESSAGE/);
  assert.doesNotMatch(routeSource, /error_message:\s*aiResult\.error/);
  assert.doesNotMatch(routeSource, /error_message:\s*error\.message/);
});

test('legacy detection stream errors do not expose provider exception messages', () => {
  assert.doesNotMatch(routeSource, /event:\s*'error',\s*message:\s*err\.message/);
  assert.doesNotMatch(routeSource, /event:\s*'error',\s*message:\s*error\.message/);
});

test('legacy detection rejects explicit non-mainland platforms instead of silently dropping them', () => {
  assert.match(routeSource, /ScheduleProjectContextService\.validatePlatformsWithinContext\(/);
  assert.match(routeSource, /if \(!platformResult\.ok\)/);
  assert.doesNotMatch(routeSource, /filter\(p => validKeys\.includes\(p\)\)[\s\S]*filter\(p => MAINLAND_MONITORING_PLATFORMS\.includes\(p\)\)/);
});

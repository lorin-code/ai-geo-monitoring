const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const routeSource = fs.readFileSync(path.resolve(__dirname, '../routes/statistics.js'), 'utf8');

test('statistics route errors do not expose internal exception messages', () => {
  assert.doesNotMatch(routeSource, /error:\s*error\.message/);
});

test('keyword statistics route loads stored keyword counts', () => {
  assert.match(routeSource, /attributes:\s*\[[^\]]*'result_summary'/);
});

test('statistics routes only aggregate mainland monitoring platforms', () => {
  assert.match(routeSource, /MAINLAND_MONITORING_PLATFORMS\s*=\s*\[\s*'doubao'\s*,\s*'deepseek'\s*\]/);
  assert.match(routeSource, /function\s+withMainlandPlatformScope/);
  assert.doesNotMatch(routeSource, /where:\s*whereClause/);
  assert.doesNotMatch(routeSource, /where:\s*metricWhereClause/);

  const scopedQueries = routeSource.match(/where:\s*withMainlandPlatformScope/g) || [];
  assert.ok(scopedQueries.length >= 10);
});

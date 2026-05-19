const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('project monitoring period queries use closed time windows', () => {
  const geoProjectsRoute = fs.readFileSync(path.join(root, 'routes', 'geoProjects.js'), 'utf8');
  const statisticsRoute = fs.readFileSync(path.join(root, 'routes', 'statistics.js'), 'utf8');
  const alertService = fs.readFileSync(path.join(root, 'services', 'AlertEvaluationService.js'), 'utf8');

  assert.equal(geoProjectsRoute.includes('[Op.gte]: periodStart'), false);
  assert.equal(geoProjectsRoute.includes('[Op.gte]: changePeriodStart'), false);
  assert.equal(statisticsRoute.includes('[Op.gte]: periodStart'), false);
  assert.equal(alertService.includes('[Op.gte]: since'), false);
  assert.equal(alertService.includes('[Op.gte]: sourceSince'), false);
  assert.match(geoProjectsRoute, /\[Op\.between\]: \[periodStart, periodEnd\]/);
  assert.match(geoProjectsRoute, /\[Op\.between\]: \[changePeriodStart, periodEnd\]/);
  assert.match(statisticsRoute, /\[Op\.between\]: \[periodStart, periodEnd\]/);
  assert.match(alertService, /\[Op\.between\]: \[since, now\]/);
  assert.match(alertService, /\[Op\.between\]: \[sourceSince, now\]/);
});

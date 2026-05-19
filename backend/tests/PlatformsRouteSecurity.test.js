const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const routeSource = fs.readFileSync(path.resolve(__dirname, '../routes/platforms.js'), 'utf8');

test('platform health route errors do not expose internal exception messages', () => {
  assert.doesNotMatch(routeSource, /error:\s*error\.message/);
});

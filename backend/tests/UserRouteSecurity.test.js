const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('user routes do not expose internal error messages in 500 responses', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../routes/user.js'), 'utf8');

  assert.doesNotMatch(source, /status\(\s*500\s*\)\.json\(\{[\s\S]*?error:\s*error\.message[\s\S]*?\}\)/);
  assert.doesNotMatch(source, /error:\s*error\.message/);
});

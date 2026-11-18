const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.resolve(__dirname, '../app/admin/platforms/page.tsx'), 'utf8');

test('admin platform status copy avoids raw API key wording', () => {
  assert.doesNotMatch(source, /API Key|API密钥/);
  assert.match(source, /个人中心/);
  assert.match(source, /校验/);
});

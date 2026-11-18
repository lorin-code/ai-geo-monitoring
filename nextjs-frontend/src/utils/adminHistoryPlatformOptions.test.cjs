/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('admin history platform filters only expose mainland monitoring platforms', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../app/admin/history/page.tsx'), 'utf8');

  assert.match(source, /PLATFORM_LABELS[\s\S]*doubao[\s\S]*deepseek/);
  assert.match(source, /qianwen/);
  assert.match(source, /kimi/);
});

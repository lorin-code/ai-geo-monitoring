const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const routeSource = fs.readFileSync(path.resolve(__dirname, '../routes/geoProjects.js'), 'utf8');

test('geo project route messages avoid implementation-specific prompt generation wording', () => {
  const forbidden = [
    'DeepSeek 生成',
    '使用 DeepSeek',
    'AI 生成 Prompt',
    'AI 返回内容',
    '配置生成服务',
    'API Key'
  ];
  const offenders = forbidden.filter((text) => routeSource.includes(text));

  assert.deepEqual(offenders, []);
});

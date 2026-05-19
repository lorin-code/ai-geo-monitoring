const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const routeSource = fs.readFileSync(path.resolve(__dirname, '../routes/detection.js'), 'utf8');

test('legacy detection route limits explicit platform selections to mainland monitoring platforms', () => {
  assert.match(routeSource, /MAINLAND_MONITORING_PLATFORMS/);
  assert.match(routeSource, /filter\(p => MAINLAND_MONITORING_PLATFORMS\.includes\(p\)\)/);
  assert.match(routeSource, /validatePlatformsWithinContext\(/);
  assert.match(routeSource, /检测平台必须包含在项目或 Prompt 的监测平台内/);
});

test('legacy detection route defaults only to mainland monitoring platforms', () => {
  assert.match(routeSource, /availableList[\s\S]*filter\(p => MAINLAND_MONITORING_PLATFORMS\.includes\(p\)\)/);
  assert.match(routeSource, /defaultPlatformsForContext\(/);
  assert.match(routeSource, /message: '当前没有可用的监测平台，请联系管理员处理'/);
});

test('legacy detection route avoids provider configuration wording in user responses', () => {
  assert.doesNotMatch(routeSource, /message:\s*['"`][^'"`]*(API Key|API密钥|当前没有可用的AI平台|不支持的AI平台)/);
  assert.doesNotMatch(routeSource, /event:\s*'error',\s*message:\s*`[^`]*(API Key|API密钥|不支持的AI平台)/);
});

test('legacy async detection guards empty AI responses before creating result details', () => {
  const extractIndex = routeSource.indexOf('const originalText = ResultParserService.extractResponseText(aiResult.data)');
  const detailIndex = routeSource.indexOf('await ResultDetail.create', extractIndex);
  const guardIndex = routeSource.indexOf('监测平台返回内容为空', extractIndex);

  assert.ok(extractIndex > 0);
  assert.ok(detailIndex > extractIndex);
  assert.ok(guardIndex > extractIndex);
  assert.ok(guardIndex < detailIndex);
});

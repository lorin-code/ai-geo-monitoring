const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { once } = require('node:events');
process.env.NODE_ENV = 'test';
process.env.DB_STORAGE = ':memory:';
delete process.env.DATABASE_URL;
process.env.MONITORING_PLATFORMS = 'deepseek,doubao,qianwen,kimi';
process.env.PLATFORM_CREDENTIAL_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
process.env.JWT_SECRET = 'test-credentials-jwt-secret';
process.env.DEEPSEEK_API_KEY = 'server-key-must-never-be-used';
process.env.DOUBAO_API_KEY = 'server-key-must-never-be-used';
process.env.QIANWEN_API_KEY = 'server-key-must-never-be-used';
process.env.DEEPSEEK_SEARCH_ENABLED = 'true';
const axios = require('axios');
const express = require('express');
const jwt = require('jsonwebtoken');
const { sequelize, User, UserPlatformCredential, BrandProject, TrackedPrompt, QuestionRecord } = require('../models');
const credentials = require('../services/UserPlatformCredentialService');
const context = require('../services/UserPlatformContext');
const ai = require('../services/AIPlatformService');
const selection = require('../services/PlatformSelectionService');
const scheduler = require('../services/SchedulerService');
const { authRequired } = require('../middleware/auth');
const catalog = require('../config/providerCatalog');
const key = (userId, platform) => `test-key-user-${userId}-${platform}`;
const answer = { data: { choices: [{ message: { content: '连接成功。' } }] }, headers: {} };
const requests = [];
const transport = { post: async (url, body, config) => {
  requests.push({ url, body, config });
  return url === catalog.kimi.searchUrl ? { data: { search_results: [] } } : url.endsWith('/tools/search') ? { data: { results: [] } } : answer;
} };
let server;
let baseUrl;
let realPost;

async function save(userId, platform, overrides = {}) {
  return credentials.verifyAndSave({ userId, platform,
    input: { api_key: key(userId, platform), model: catalog[platform].model, ...overrides }, transport });
}

test.before(async () => {
  await sequelize.sync({ force: true });
  await User.bulkCreate([1, 2].map((id) => ({ id, username: `user-${id}`, email: `user${id}@example.com`, password: 'unused' })));
  const app = express();
  app.use(express.json());
  app.use('/platforms', authRequired, require('../routes/platforms'));
  app.use('/projects', authRequired, context.middleware, require('../routes/geoProjects'));
  app.use('/detection', authRequired, context.middleware, require('../routes/detection'));
  app.use('/schedules', authRequired, context.middleware, require('../routes/schedules'));
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  realPost = axios.post;
});

test.beforeEach(async () => {
  await UserPlatformCredential.destroy({ where: {} });
  await BrandProject.destroy({ where: {} });
  await QuestionRecord.destroy({ where: {} });
  requests.length = 0;
});

test.afterEach(() => { axios.post = realPost; });
test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await sequelize.close();
});

test('server environment keys never enable a platform or permit an unconfigured user to call it', async () => {
  assert.deepEqual(ai.getAvailablePlatforms(), []);
  for (const platform of Object.keys(catalog)) {
    const result = await context.run(1, () => ai.queryPlatform(platform, '测试', { search: false }));
    assert.equal(result.success, false);
  }
  const states = await credentials.list(1);
  assert.equal(states.length, 4);
  assert.equal(states.every((item) => !item.ok && !item.configured), true);
  assert.equal(selection.validateUsable(['deepseek']).ok, false);
});

test('each official provider makes a real model-shaped validation call before saving encrypted, user-bound credentials', async () => {
  for (const platform of Object.keys(catalog)) {
    const result = await save(1, platform);
    const state = result.find((item) => item.platform === platform);
    assert.equal(state.ok, true);
    assert.equal(state.model, catalog[platform].model);
    assert.ok(state.verified_at);
    assert.doesNotMatch(JSON.stringify(result), new RegExp(key(1, platform)));
    const dbRow = await UserPlatformCredential.unscoped().findOne({ where: { user_id: 1, platform } });
    assert.notEqual(dbRow.encrypted_key, key(1, platform));
    assert.equal(credentials.decrypt(dbRow.encrypted_key, 1, platform), key(1, platform));
    assert.throws(() => credentials.decrypt(dbRow.encrypted_key, 2, platform));
    assert.equal((await UserPlatformCredential.findByPk(dbRow.id)).encrypted_key, undefined);
    const call = requests.find((item) => item.url === catalog[platform].apiUrl);
    assert.equal(call.config.headers.Authorization, `Bearer ${key(1, platform)}`);
    assert.equal(call.config.maxRedirects, 0);
    assert.equal(call.body.model, catalog[platform].model);
    if (platform === 'doubao') assert.deepEqual(call.body.tools, [{ type: 'web_search' }]);
    if (platform === 'qianwen') assert.equal(call.body.enable_search, true);
    if (platform === 'kimi') {
      assert.equal(call.body.reasoning_effort, 'low');
      assert.equal(call.body.temperature, undefined);
      const search = requests.find((item) => item.url === catalog.kimi.searchUrl);
      assert.deepEqual(search.body, { text_query: 'Kimi 官方', limit: 1, timeout_seconds: 30 });
      assert.equal(search.config.headers.Authorization, `Bearer ${key(1, platform)}`);
    }
  }
  assert.equal(requests.length, 6); // DeepSeek and Kimi each validate their model and independent Search API.
});

test('Kimi validates search access before saving and preserves an existing credential on rejection', async () => {
  await save(1, 'kimi');
  for (const response of [{ error: { message: 'denied' } }, { results: [] }, { search_results: [{ url: 'javascript:alert(1)' }] }]) {
    await assert.rejects(credentials.verifyAndSave({ userId: 1, platform: 'kimi',
      input: { api_key: 'replacement-kimi-secret' }, transport: { post: async (url) =>
        url === catalog.kimi.searchUrl ? { data: response } : answer } }), { status: 422 });
    assert.equal((await credentials.loadConfigs(1)).kimi.apiKey, key(1, 'kimi'));
  }
});

test('Kimi monitoring searches with owner credentials, retains actual citations and fails closed on search errors', async () => {
  await save(1, 'kimi');
  const calls = [];
  axios.post = async (url, body, config) => {
    calls.push({ url, body, config });
    assert.equal(config.headers.Authorization, `Bearer ${key(1, 'kimi')}`);
    if (url === catalog.kimi.searchUrl) return { data: { search_results: [
      { url: 'https://example.com/used', title: '已引用', snippet: '可靠摘要' },
      { url: 'https://example.com/unused', title: '未引用', snippet: '其他摘要' }
    ] }, headers: {} };
    return { data: { choices: [{ message: { content: '参考资料 [1]' } }] }, headers: {} };
  };
  const result = await context.run(1, () => ai.queryPlatform('kimi', '测试问题'));
  assert.equal(result.success, true);
  assert.deepEqual(calls.map((call) => call.url), [catalog.kimi.searchUrl, catalog.kimi.apiUrl]);
  assert.deepEqual(calls[0].body, { text_query: '测试问题', limit: 5, timeout_seconds: 30 });
  assert.match(calls[1].body.messages[1].content, /可靠摘要/);
  assert.equal(calls[1].body.temperature, undefined);
  assert.equal(result.data.kimi_search.result_count, 2);
  assert.equal(result.data.deepseek_search, undefined);
  assert.deepEqual(result.data.choices[0].message.annotations.map((item) => item.url_citation.url), ['https://example.com/used']);
  calls.length = 0;
  await context.run(1, () => ai.queryPlatform('kimi', '纯对话', { search: false }));
  assert.deepEqual(calls.map((call) => call.url), [catalog.kimi.apiUrl]);
  calls.length = 0;
  axios.post = async (url) => { calls.push(url); return { data: { error: 'search unavailable' }, headers: {} }; };
  const failed = await context.run(1, () => ai.queryPlatform('kimi', '测试问题'));
  assert.equal(failed.success, false);
  assert.deepEqual(calls, [catalog.kimi.searchUrl]);
});

test('failed validation, insufficient balance and missing search permissions never save or overwrite a working key', async () => {
  for (const status of [400, 401, 402, 403, 404, 429, 503]) {
    await assert.rejects(credentials.verifyAndSave({ userId: 1, platform: 'deepseek', input: { api_key: key(1, 'deepseek') },
      transport: { post: async () => { const error = new Error('secret upstream detail'); error.response = { status }; throw error; } }
    }), (error) => error.status === 422 && !error.message.includes('secret'));
    assert.equal(await UserPlatformCredential.count(), 0);
  }
  await save(1, 'deepseek');
  const old = await UserPlatformCredential.unscoped().findOne({ where: { user_id: 1 } });
  await assert.rejects(credentials.verifyAndSave({ userId: 1, platform: 'deepseek', input: { api_key: 'replacement-secret-key' },
    transport: { post: async (url) => url.endsWith('/tools/search') ? { data: { error: 'denied' } } : answer }
  }), { status: 422 });
  const current = await UserPlatformCredential.unscoped().findOne({ where: { user_id: 1 } });
  assert.equal(current.encrypted_key, old.encrypted_key);
  assert.equal((await credentials.loadConfigs(1)).deepseek.apiKey, key(1, 'deepseek'));
});

test('concurrent users and background scopes keep keys, models and official endpoints isolated', async () => {
  await save(1, 'deepseek', { model: 'model-one' });
  await save(2, 'deepseek', { model: 'model-two' });
  axios.post = async (url, body, config) => {
    await new Promise((resolve) => setImmediate(resolve));
    requests.push({ url, body, config });
    return answer;
  };
  requests.length = 0;
  await Promise.all([1, 2].map((userId) => context.run(userId, async () => {
    assert.deepEqual(ai.getAvailablePlatforms(), ['deepseek']);
    await new Promise((resolve) => setImmediate(resolve));
    const result = await ai.queryPlatform('deepseek', '测试', { search: false });
    assert.equal(result.success, true);
    await new Promise((resolve) => setImmediate(async () => {
      assert.equal(context.get().userId, userId);
      resolve();
    }));
  })));
  assert.deepEqual(requests.map((call) => call.body.model).sort(), ['model-one', 'model-two']);
  for (const call of requests) {
    const userId = call.body.model === 'model-one' ? 1 : 2;
    assert.equal(call.config.headers.Authorization, `Bearer ${key(userId, 'deepseek')}`);
    assert.equal(call.url, catalog.deepseek.apiUrl);
  }
  assert.deepEqual(ai.getAvailablePlatforms(), []);
  const scope = await ai.forUser(2);
  assert.equal(scope.platforms.deepseek.apiKey, key(2, 'deepseek'));
});

test('deleting one user credential disables that user while preserving other users and historical project data', async () => {
  await save(1, 'deepseek');
  await save(2, 'deepseek');
  const project = await BrandProject.create({ user_id: 1, name: '保留历史品牌', platforms: ['deepseek'] });
  await credentials.remove(1, 'deepseek');
  assert.deepEqual(await context.run(1, () => ai.getAvailablePlatforms()), []);
  assert.deepEqual(await context.run(2, () => ai.getAvailablePlatforms()), ['deepseek']);
  assert.ok(await BrandProject.findByPk(project.id));
});

test('invalid input cannot select arbitrary hosts or unsupported providers and receives no validation requests', async () => {
  for (const [platform, input] of [['unknown', { api_key: 'test-secret-key' }], ['deepseek', { api_key: '' }],
    ['deepseek', { api_key: 'spaces in secret key' }], ['doubao', { api_key: 'test-secret-key', model: 'https://evil.example/key' }]]) {
    await assert.rejects(credentials.verifyAndSave({ userId: 1, platform, input, transport }), { status: 400 });
  }
  assert.equal(requests.length, 0);
});

test('Prompt generation uses the explicitly selected owner model and rejects unavailable choices without fallback', async () => {
  await save(1, 'deepseek');
  await save(1, 'kimi', { model: 'kimi-k3.1-pro-highspeed' });
  await save(2, 'doubao');
  const project = await BrandProject.create({ user_id: 1, name: '甲品牌', platforms: ['deepseek'] });
  const headers = { Authorization: `Bearer ${jwt.sign({ userId: 2, role: 'admin' }, process.env.JWT_SECRET)}`,
    'Content-Type': 'application/json' };
  const endpoint = `${baseUrl}/projects/${project.id}/prompts`;
  const options = await fetch(`${endpoint}/generation-platforms`, { headers });
  assert.equal(options.status, 200);
  const payload = await options.json();
  assert.equal(payload.data.default_platform, 'deepseek');
  assert.deepEqual(payload.data.platforms.filter((item) => item.available).map((item) => item.platform), ['deepseek', 'kimi']);
  assert.equal(payload.data.platforms.find((item) => item.platform === 'kimi').model, 'kimi-k3.1-pro-highspeed');
  assert.doesNotMatch(JSON.stringify(payload), /test-key|encrypted_key|masked_key|Authorization/);
  const calls = [];
  axios.post = async (url, body, config) => {
    calls.push({ url, body, config });
    return { data: { choices: [{ message: { content: JSON.stringify([
      { question: '静音轮胎应该怎么选择', tags: ['购买决策'] },
      { question: '买轮胎需要关注哪些参数', tags: ['购买决策'] },
      { question: '新能源车轮胎应该怎么选', tags: ['购买决策'] }
    ]) } }] }, headers: {} };
  };
  const post = (body) => fetch(`${endpoint}/generate`, { method: 'POST', headers, body: JSON.stringify(body) });
  const selected = await post({ platform: 'kimi', count: 3 });
  assert.equal(selected.status, 200);
  const generated = await selected.json();
  assert.equal(generated.data.platform, 'kimi');
  assert.equal(generated.data.model, 'kimi-k3.1-pro-highspeed');
  assert.equal(generated.data.suggestions.length, 3);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, catalog.kimi.apiUrl);
  assert.equal(calls[0].body.model, 'kimi-k3.1-pro-highspeed');
  assert.equal(calls[0].config.headers.Authorization, `Bearer ${key(1, 'kimi')}`);
  for (const platform of ['doubao', 'unknown', '', ['kimi'], null]) {
    assert.equal((await post({ platform, count: 3 })).status, 400);
  }
  assert.equal(calls.length, 1);
  assert.equal((await post({ count: 3 })).status, 200); // Older clients keep the automatic default.
  assert.equal(calls[1].url, catalog.deepseek.apiUrl);
  assert.equal(calls[1].body.enable_search, undefined);
  const denied = await fetch(`${endpoint}/generation-platforms`, { headers: {
    Authorization: `Bearer ${jwt.sign({ userId: 2, role: 'user' }, process.env.JWT_SECRET)}` } });
  assert.equal(denied.status, 403);
});

test('credential endpoints enforce identity, validate before save, omit secrets, and allow deletion', async () => {
  const headers = { Authorization: `Bearer ${jwt.sign({ userId: 1, role: 'user' }, process.env.JWT_SECRET)}`, 'Content-Type': 'application/json' };
  axios.post = transport.post;
  for (const [method, endpoint] of [['GET', '/platforms/ping'], ['POST', '/platforms/deepseek/credential'], ['DELETE', '/platforms/deepseek/credential']]) {
    assert.equal((await fetch(`${baseUrl}${endpoint}`, { method })).status, 401);
  }
  const response = await fetch(`${baseUrl}/platforms/qianwen/credential`, { method: 'POST', headers,
    body: JSON.stringify({ api_key: key(1, 'qianwen'), user_id: 2, model: 'qwen-plus' }) });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.find((item) => item.platform === 'qianwen').ok, true);
  assert.doesNotMatch(JSON.stringify(body), /test-key-user|encrypted_key|Authorization/);
  assert.equal(await UserPlatformCredential.count({ where: { user_id: 2 } }), 0);
  const invalid = await fetch(`${baseUrl}/platforms/deepseek/credential`, { method: 'POST', headers, body: JSON.stringify({ api_key: '' }) });
  assert.equal(invalid.status, 400);
  assert.equal((await fetch(`${baseUrl}/platforms/qianwen/credential`, { method: 'DELETE', headers })).status, 200);
  assert.equal(await UserPlatformCredential.count(), 0);
});

test('project creation and detection reject unconfigured platforms on the server without charging or creating records', async () => {
  const headers = { Authorization: `Bearer ${jwt.sign({ userId: 1, role: 'user' }, process.env.JWT_SECRET)}`, 'Content-Type': 'application/json' };
  const deniedProject = await fetch(`${baseUrl}/projects`, { method: 'POST', headers,
    body: JSON.stringify({ name: '未配置项目', platforms: ['deepseek'] }) });
  assert.equal(deniedProject.status, 400);
  assert.equal(await BrandProject.count(), 0);
  const deniedDetection = await fetch(`${baseUrl}/detection/create`, { method: 'POST', headers,
    body: JSON.stringify({ question: '测试问题', platforms: ['deepseek'] }) });
  assert.equal(deniedDetection.status, 400);
  assert.equal(await QuestionRecord.count(), 0);
  await save(1, 'qianwen');
  const mixedSelection = await fetch(`${baseUrl}/detection/create`, { method: 'POST', headers,
    body: JSON.stringify({ question: '测试问题', platforms: ['qianwen', 'deepseek'] }) });
  assert.equal(mixedSelection.status, 400);
  assert.equal(await QuestionRecord.count(), 0);
  const allowedProject = await fetch(`${baseUrl}/projects`, { method: 'POST', headers,
    body: JSON.stringify({ name: '千问项目', platforms: ['qianwen'] }) });
  assert.equal(allowedProject.status, 200);
  const selectionResult = await context.run(1, () => selection.validateUsable(['qianwen']));
  assert.equal(selectionResult.ok, true);
  const deniedSchedule = await fetch(`${baseUrl}/schedules`, { method: 'POST', headers,
    body: JSON.stringify({ question: '测试问题', platforms: ['deepseek'], daily_time: '09:00' }) });
  assert.equal(deniedSchedule.status, 400);
});

test('scheduled project execution loads the project owner credentials even under another users request scope', async (t) => {
  await save(1, 'qianwen');
  await save(2, 'deepseek');
  const project = await BrandProject.create({ user_id: 1, name: '定时项目', platforms: ['qianwen'], monitoring_enabled: true });
  await TrackedPrompt.create({ user_id: 1, project_id: project.id, question: '测试问题', platforms: ['qianwen'] });
  const runs = require('../services/ProjectRunService');
  let called = false;
  t.mock.method(runs, 'runProject', async () => {
    called = true;
    assert.equal(context.get().userId, 1);
    assert.deepEqual(ai.getAvailablePlatforms(), ['qianwen']);
    assert.equal(ai.platforms.qianwen.apiKey, key(1, 'qianwen'));
    return { ok: true };
  });
  assert.equal(await context.run(2, () => scheduler.runProjectNow(project.id)), true);
  assert.equal(called, true);
});

test('qianwen monitoring uses official search options and keeps only actually referenced sources', async () => {
  await save(1, 'qianwen');
  axios.post = async (url, body) => {
    assert.equal(url, catalog.qianwen.apiUrl);
    assert.equal(body.enable_search, true);
    assert.equal(body.search_options.enable_citation, true);
    return { data: { choices: [{ message: { content: '资料参考[ref_1]。' } }], search_info: { search_results: [
      { index: 1, title: '已引用', url: 'https://example.com/used' },
      { index: 2, title: '未引用', url: 'https://example.com/unused' }
    ] } }, headers: {} };
  };
  const result = await context.run(1, () => ai.queryPlatform('qianwen', '测试问题'));
  assert.equal(result.success, true);
  const citations = require('../services/CitationAnalysisService').extractSources({ responseText: '资料参考[ref_1]。', aiResponse: result.data });
  assert.equal(citations.citation_count, 1);
  assert.equal(citations.sources[0].url, 'https://example.com/used');
});

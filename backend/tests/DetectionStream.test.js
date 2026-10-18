const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { PassThrough } = require('node:stream');
const axios = require('axios');

const AIPlatformService = require('../services/AIPlatformService');
const CitationAnalysisService = require('../services/CitationAnalysisService');

function createStreamHarness(context, searchEnabled = 'true') {
  const originalConfig = AIPlatformService.platforms.deepseek;
  const keys = ['DEEPSEEK_SEARCH_ENABLED', 'DEEPSEEK_SEARCH_API_URL', 'DEEPSEEK_SEARCH_COUNT'];
  const env = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  context.after(() => {
    AIPlatformService.platforms.deepseek = originalConfig;
    keys.forEach((key) => {
      if (env[key] === undefined) delete process.env[key];
      else process.env[key] = env[key];
    });
  });
  keys.forEach((key) => delete process.env[key]);
  process.env.DEEPSEEK_SEARCH_ENABLED = searchEnabled;
  AIPlatformService.platforms.deepseek = {
    ...originalConfig,
    apiKey: 'test-key',
    apiUrl: 'https://api.deepseek.com/v1/chat/completions',
    headers: { Authorization: 'Bearer test-key', 'Content-Type': 'application/json' }
  };

  const details = [];
  const finalized = [];
  const records = [];
  const routePath = path.resolve(__dirname, '../routes/detection.js');
  const originalRequire = createRequire(routePath);
  const overrides = {
    '../models': {
      QuestionRecord: { create: async (payload) => { records.push(payload); return { ...payload, id: 7 }; } },
      ResultDetail: { create: async (payload) => details.push(payload) }
    },
    '../middleware/quota': { bulkConsumeQuota: async () => true },
    '../middleware/auth': { authRequired: (req, res, next) => next(), adminRequired: (req, res, next) => next() },
    '../services/ScheduleProjectContextService': { resolveProjectContext: async () => ({ user_id: 9, project_id: 2 }) },
    '../services/ProjectRecordFinalizationService': { finalize: async (payload) => { finalized.push(payload); return { ok: true }; } }
  };
  const routeModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync(routePath, 'utf8'), {
    module: routeModule,
    require: (name) => overrides[name] || originalRequire(name),
    console: { error() {}, warn() {}, log() {} },
    setTimeout: (callback) => { queueMicrotask(callback); }
  }, { filename: routePath });
  const route = routeModule.exports.stack.find((layer) => layer.route?.path === '/stream').route;
  const handler = route.stack.at(-1).handle;
  const events = [];
  let endResponse;
  const ended = new Promise((resolve) => { endResponse = resolve; });
  const response = {
    setHeader() {}, flushHeaders() {}, flush() {},
    write: (chunk) => events.push(JSON.parse(chunk.trim().replace(/^data:\s*/, ''))),
    end: () => endResponse()
  };
  const run = () => handler({ query: { platform: 'deepseek', question: '最新轮胎推荐' }, user: { id: 9 } }, response);
  return { run, ended, events, details, finalized, records };
}

test('DeepSeek search preview uses the shared search pipeline and persists cited sources with the original text', async (context) => {
  const harness = createStreamHarness(context);
  const content = '资料[1]。\n\n- 保留 Markdown 段落与空格\n- 第二项 🚗';
  const urls = [];
  context.mock.method(axios, 'post', async (url) => {
    urls.push(url);
    return {
      data: url.endsWith('/tools/search')
        ? { results: [{ title: '品牌资料', url: 'https://brand.cn/guide', summary: '产品参数' }] }
        : { choices: [{ message: { content } }] },
      headers: {}
    };
  });

  await harness.run();
  await harness.ended;

  assert.deepEqual(urls, ['https://api.deepseek.com/v1/tools/search', 'https://api.deepseek.com/v1/chat/completions']);
  assert.equal(harness.events.filter((event) => event.event === 'delta').map((event) => event.content).join(''), content);
  assert.equal(harness.events.at(-1).event, 'done');
  assert.equal(harness.records.length, 1);
  assert.equal(harness.details[0].ai_response_original, content);
  assert.equal(harness.finalized.length, 1);
  assert.equal(CitationAnalysisService.extractSources({ aiResponse: harness.finalized[0].aiResponse }).citation_count, 1);
});

test('DeepSeek search preview reports search failures without saving a successful record', async (context) => {
  const harness = createStreamHarness(context);
  const originalError = console.error;
  context.after(() => { console.error = originalError; });
  console.error = () => {};
  context.mock.method(axios, 'post', async () => {
    const error = new Error('search failed');
    error.response = { status: 402 };
    throw error;
  });

  await harness.run();
  await harness.ended;

  assert.equal(harness.events.length, 1);
  assert.equal(harness.events[0].event, 'error');
  assert.equal(harness.records.length, 0);
  assert.equal(harness.details.length, 0);
});

test('DeepSeek preview retains native streaming when search is disabled', async (context) => {
  const harness = createStreamHarness(context, 'false');
  const upstream = new PassThrough();
  const calls = [];
  context.mock.method(axios, 'post', async (url, data, config) => {
    calls.push({ url, data, config });
    return { data: upstream };
  });

  await harness.run();
  upstream.end(`data: ${JSON.stringify({ choices: [{ delta: { content: '纯对话回答' } }] })}\n\n`);
  await harness.ended;

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.deepseek.com/v1/chat/completions');
  assert.equal(calls[0].data.stream, true);
  assert.equal(harness.details[0].ai_response_original, '纯对话回答');
});

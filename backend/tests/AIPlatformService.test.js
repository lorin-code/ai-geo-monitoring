const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');

const AIPlatformService = require('../services/AIPlatformService');

test('uses platform specific model environment variables', () => {
  const originalDeepseekModel = process.env.DEEPSEEK_MODEL;
  const originalKimiModel = process.env.KIMI_MODEL;
  const originalQianwenModel = process.env.QIANWEN_MODEL;

  process.env.DEEPSEEK_MODEL = 'deepseek-reasoner';
  process.env.KIMI_MODEL = 'moonshot-v1-32k';
  process.env.QIANWEN_MODEL = 'qwen-plus';

  try {
    assert.equal(AIPlatformService.getModelName('deepseek'), 'deepseek-reasoner');
    assert.equal(AIPlatformService.getModelName('kimi'), 'moonshot-v1-32k');
    assert.equal(AIPlatformService.getModelName('qianwen'), 'qwen-plus');
  } finally {
    restoreEnv('DEEPSEEK_MODEL', originalDeepseekModel);
    restoreEnv('KIMI_MODEL', originalKimiModel);
    restoreEnv('QIANWEN_MODEL', originalQianwenModel);
  }
});

test('keeps stable default model names when no override is configured', () => {
  const originalDeepseekModel = process.env.DEEPSEEK_MODEL;

  delete process.env.DEEPSEEK_MODEL;

  try {
    assert.equal(AIPlatformService.getModelName('deepseek'), 'deepseek-chat');
  } finally {
    restoreEnv('DEEPSEEK_MODEL', originalDeepseekModel);
  }
});

test('uses a responses model for doubao web search requests instead of the legacy chat model override', () => {
  const originalDoubaoModel = process.env.DOUBAO_MODEL;
  const originalDoubaoResponsesModel = process.env.DOUBAO_RESPONSES_MODEL;

  process.env.DOUBAO_MODEL = 'doubao-1-5-pro-32k-250115';
  delete process.env.DOUBAO_RESPONSES_MODEL;

  try {
    const requestData = AIPlatformService.buildRequestData('doubao', '测试问题');
    assert.equal(requestData.model, 'doubao-seed-1-6-250615');
  } finally {
    restoreEnv('DOUBAO_MODEL', originalDoubaoModel);
    restoreEnv('DOUBAO_RESPONSES_MODEL', originalDoubaoResponsesModel);
  }
});

test('allows overriding the doubao responses model independently', () => {
  const originalDoubaoResponsesModel = process.env.DOUBAO_RESPONSES_MODEL;

  process.env.DOUBAO_RESPONSES_MODEL = 'custom-responses-model';

  try {
    const requestData = AIPlatformService.buildRequestData('doubao', '测试问题');
    assert.equal(requestData.model, 'custom-responses-model');
  } finally {
    restoreEnv('DOUBAO_RESPONSES_MODEL', originalDoubaoResponsesModel);
  }
});

test('reports available platforms only for supported mainland monitoring platforms', () => {
  const originalDoubaoApiKey = AIPlatformService.platforms.doubao.apiKey;
  const originalDeepseekApiKey = AIPlatformService.platforms.deepseek.apiKey;
  const originalKimiApiKey = AIPlatformService.platforms.kimi?.apiKey;
  const originalQianwenApiKey = AIPlatformService.platforms.qianwen?.apiKey;

  AIPlatformService.platforms.doubao.apiKey = 'doubao-key';
  AIPlatformService.platforms.deepseek.apiKey = 'deepseek-key';
  AIPlatformService.platforms.kimi.apiKey = 'kimi-key';
  AIPlatformService.platforms.qianwen.apiKey = 'qianwen-key';

  try {
    assert.deepEqual(AIPlatformService.getAvailablePlatforms(), ['doubao', 'deepseek']);
  } finally {
    AIPlatformService.platforms.doubao.apiKey = originalDoubaoApiKey;
    AIPlatformService.platforms.deepseek.apiKey = originalDeepseekApiKey;
    AIPlatformService.platforms.kimi.apiKey = originalKimiApiKey;
    AIPlatformService.platforms.qianwen.apiKey = originalQianwenApiKey;
  }
});

test('reports platform response time as elapsed milliseconds when header is unavailable', async () => {
  const originalPost = axios.post;
  const originalNow = Date.now;
  const originalApiKey = AIPlatformService.platforms.deepseek.apiKey;
  const originalHeaders = { ...AIPlatformService.platforms.deepseek.headers };
  let nowCall = 0;

  AIPlatformService.platforms.deepseek.apiKey = 'test-key';
  AIPlatformService.platforms.deepseek.headers.Authorization = 'Bearer test-key';
  Date.now = () => {
    nowCall += 1;
    return nowCall === 1 ? 1000 : 1280;
  };
  axios.post = async () => ({
    data: { choices: [{ message: { content: '测试回答' } }] },
    headers: {}
  });

  try {
    const result = await AIPlatformService.queryPlatform('deepseek', '测试问题', { search: false });
    assert.equal(result.success, true);
    assert.equal(result.responseTime, 280);
  } finally {
    axios.post = originalPost;
    Date.now = originalNow;
    AIPlatformService.platforms.deepseek.apiKey = originalApiKey;
    AIPlatformService.platforms.deepseek.headers = originalHeaders;
  }
});

test('does not log raw ai platform error response payloads', async () => {
  const originalPost = axios.post;
  const originalError = console.error;
  const originalApiKey = AIPlatformService.platforms.deepseek.apiKey;
  const originalHeaders = { ...AIPlatformService.platforms.deepseek.headers };
  const logs = [];

  AIPlatformService.platforms.deepseek.apiKey = 'test-key';
  AIPlatformService.platforms.deepseek.headers.Authorization = 'Bearer test-key';
  axios.post = async () => {
    const error = new Error('request failed');
    error.response = {
      status: 400,
      data: { error: { code: 'AccountOverdueError', message: 'provider raw detail', token: 'secret-token' } }
    };
    throw error;
  };
  console.error = (...args) => logs.push(args.join(' '));

  try {
    const result = await AIPlatformService.queryPlatform('deepseek', '测试问题', { search: false });
    assert.equal(result.success, false);
    assert.equal(logs.some((line) => line.includes('status 400')), true);
    assert.equal(logs.some((line) => line.includes('AccountOverdueError')), true);
    assert.equal(result.error.includes('AccountOverdueError'), true);
    assert.equal(logs.some((line) => line.includes('secret-token')), false);
    assert.equal(logs.some((line) => line.includes('provider raw detail')), false);
  } finally {
    axios.post = originalPost;
    console.error = originalError;
    AIPlatformService.platforms.deepseek.apiKey = originalApiKey;
    AIPlatformService.platforms.deepseek.headers = originalHeaders;
  }
});

test('calls doubao through Ark Responses API with web search enabled', async () => {
  const originalPost = axios.post;
  const originalApiKey = AIPlatformService.platforms.doubao.apiKey;
  const originalApiUrl = AIPlatformService.platforms.doubao.apiUrl;
  const originalHeaders = { ...AIPlatformService.platforms.doubao.headers };
  const calls = [];

  AIPlatformService.platforms.doubao.apiKey = 'test-doubao-key';
  AIPlatformService.platforms.doubao.apiUrl = 'https://ark.cn-beijing.volces.com/api/v3/chat/completions';
  AIPlatformService.platforms.doubao.headers.Authorization = 'Bearer test-doubao-key';
  axios.post = async (url, data) => {
    calls.push({ url, data });
    return {
      data: {
        output: [
          {
            type: 'message',
            content: [{ type: 'output_text', text: '联网回答' }]
          }
        ]
      },
      headers: {}
    };
  };

  try {
    const result = await AIPlatformService.queryPlatform('doubao', '今天有什么行业新闻？');

    assert.equal(result.success, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://ark.cn-beijing.volces.com/api/v3/responses');
    assert.deepEqual(calls[0].data.tools, [{ type: 'web_search' }]);
    assert.deepEqual(calls[0].data.input, [
      {
        role: 'user',
        content: [{ type: 'input_text', text: '今天有什么行业新闻？' }]
      }
    ]);
    assert.equal(calls[0].data.messages, undefined);
    assert.equal(calls[0].data.max_output_tokens, AIPlatformService.getMaxTokens('doubao'));
  } finally {
    axios.post = originalPost;
    AIPlatformService.platforms.doubao.apiKey = originalApiKey;
    AIPlatformService.platforms.doubao.apiUrl = originalApiUrl;
    AIPlatformService.platforms.doubao.headers = originalHeaders;
  }
});

test('searches before answering with the configured model and reports total search and answer latency', async (context) => {
  configureDeepseek(context);
  process.env.DEEPSEEK_MODEL = 'custom-deepseek-model';
  const calls = [];
  context.mock.method(axios, 'post', async (url, data, config) => {
    calls.push({ url, data, config });
    return url.endsWith('/tools/search')
      ? { data: { results: [{ title: '品牌资料', url: 'https://brand.cn/guide', summary: '产品参数' }] }, headers: { 'x-response-time': '25' } }
      : { data: { choices: [{ message: { content: '可以参考产品参数[1]。' } }] }, headers: { 'x-response-time': '75' } };
  });

  const result = await AIPlatformService.queryPlatform('deepseek', '最新轮胎推荐');

  assert.equal(result.success, true);
  assert.equal(result.responseTime, 100);
  assert.deepEqual(calls.map((call) => call.url), ['https://api.deepseek.com/v1/tools/search', 'https://api.deepseek.com/v1/chat/completions']);
  assert.deepEqual(calls[0].data, { query: '最新轮胎推荐', ori_question: '最新轮胎推荐', count: 10, need_content: false });
  assert.equal(calls.every((call) => call.config.headers.Authorization === 'Bearer test-key'), true);
  assert.equal(calls[1].data.model, 'custom-deepseek-model');
  assert.deepEqual(calls[1].data.messages.at(-1), { role: 'user', content: '最新轮胎推荐' });
  assert.equal(result.data.choices[0].message.annotations[0].url_citation.url, 'https://brand.cn/guide');
});

test('disables search explicitly for internal calls and globally for monitoring', async (context) => {
  configureDeepseek(context);
  const calls = [];
  context.mock.method(axios, 'post', async (url, data) => {
    calls.push({ url, data });
    return { data: { choices: [{ message: { content: '纯对话回答' } }] }, headers: {} };
  });

  const internal = await AIPlatformService.queryPlatform('deepseek', '分析原文', { search: false });
  process.env.DEEPSEEK_SEARCH_ENABLED = 'false';
  const monitoring = await AIPlatformService.queryPlatform('deepseek', '测试问题');

  assert.equal(internal.success, true);
  assert.equal(monitoring.success, true);
  assert.equal(calls.length, 2);
  assert.equal(calls.every((call) => call.url.endsWith('/chat/completions')), true);
  assert.deepEqual(calls[0].data.messages, [{ role: 'user', content: '分析原文' }]);
  assert.equal(monitoring.data.deepseek_search, undefined);
});

test('answers after an empty successful search without inventing citations', async (context) => {
  configureDeepseek(context);
  const calls = [];
  context.mock.method(axios, 'post', async (url, data) => {
    calls.push({ url, data });
    return { data: url.endsWith('/tools/search') ? { results: [] } : { choices: [{ message: { content: '没有找到可靠资料。' } }] }, headers: {} };
  });

  const result = await AIPlatformService.queryPlatform('deepseek', '罕见问题');

  assert.equal(result.success, true);
  assert.equal(calls.length, 2);
  assert.equal(result.data.deepseek_search.status, 'empty');
  assert.deepEqual(result.data.choices[0].message.annotations, []);
});

for (const status of [401, 402]) {
  test(`fails monitoring after search HTTP ${status} without calling the model or retrying`, async (context) => {
    configureDeepseek(context);
    context.mock.method(console, 'error', () => {});
    const calls = [];
    context.mock.method(axios, 'post', async (url) => {
      calls.push(url);
      const error = new Error('request failed');
      error.response = { status, data: { error: { code: 'invalid_request_error', message: 'secret-provider-detail' } } };
      throw error;
    });

    const result = await AIPlatformService.queryPlatform('deepseek', '测试问题');

    assert.equal(result.success, false);
    assert.deepEqual(calls, ['https://api.deepseek.com/v1/tools/search']);
    assert.match(result.error, new RegExp(`status ${status}`));
    assert.doesNotMatch(result.error, /secret-provider-detail/);
  });
}

test('fails monitoring for malformed search responses before generating an answer', async (context) => {
  configureDeepseek(context);
  const calls = [];
  context.mock.method(axios, 'post', async (url) => {
    calls.push(url);
    return { data: {}, headers: {} };
  });

  const result = await AIPlatformService.queryPlatform('deepseek', '测试问题');

  assert.equal(result.success, false);
  assert.match(result.error, /搜索响应/);
  assert.deepEqual(calls, ['https://api.deepseek.com/v1/tools/search']);
});

for (const status of [408, 429, 503]) {
  test(`retries search HTTP ${status} before generating one answer`, async (context) => {
    configureDeepseek(context);
    context.mock.method(console, 'error', () => {});
    context.mock.method(global, 'setTimeout', (callback) => { queueMicrotask(callback); });
    const calls = [];
    context.mock.method(axios, 'post', async (url) => {
      calls.push(url);
      if (calls.length === 1) {
        const error = new Error('temporary search failure');
        error.response = { status };
        throw error;
      }
      return { data: url.endsWith('/tools/search') ? { results: [] } : { choices: [{ message: { content: '回答' } }] }, headers: {} };
    });

    const result = await AIPlatformService.queryPlatform('deepseek', '测试问题');

    assert.equal(result.success, true);
    assert.deepEqual(calls, [
      'https://api.deepseek.com/v1/tools/search',
      'https://api.deepseek.com/v1/tools/search',
      'https://api.deepseek.com/v1/chat/completions'
    ]);
  });
}

test('retries model requests without repeating a successful search', async (context) => {
  configureDeepseek(context);
  context.mock.method(console, 'error', () => {});
  context.mock.method(global, 'setTimeout', (callback) => { queueMicrotask(callback); });
  const calls = [];
  context.mock.method(axios, 'post', async (url) => {
    calls.push(url);
    if (calls.length === 2) {
      const error = new Error('temporary model failure');
      error.response = { status: 503 };
      throw error;
    }
    return { data: url.endsWith('/tools/search') ? { results: [] } : { choices: [{ message: { content: '回答' } }] }, headers: {} };
  });

  const result = await AIPlatformService.queryPlatform('deepseek', '测试问题');

  assert.equal(result.success, true);
  assert.deepEqual(calls, [
    'https://api.deepseek.com/v1/tools/search',
    'https://api.deepseek.com/v1/chat/completions',
    'https://api.deepseek.com/v1/chat/completions'
  ]);
});

function configureDeepseek(context) {
  const original = AIPlatformService.platforms.deepseek;
  const envKeys = ['DEEPSEEK_SEARCH_ENABLED', 'DEEPSEEK_SEARCH_API_URL', 'DEEPSEEK_SEARCH_COUNT', 'DEEPSEEK_MODEL'];
  const env = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  context.after(() => {
    AIPlatformService.platforms.deepseek = original;
    envKeys.forEach((key) => restoreEnv(key, env[key]));
  });
  envKeys.forEach((key) => delete process.env[key]);
  AIPlatformService.platforms.deepseek = {
    ...original,
    apiKey: 'test-key',
    apiUrl: 'https://api.deepseek.com/v1/chat/completions',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-key' }
  };
}

function restoreEnv(key, value) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

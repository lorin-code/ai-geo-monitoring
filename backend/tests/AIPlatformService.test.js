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
    const result = await AIPlatformService.queryPlatform('deepseek', '测试问题');
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
      data: { error: { message: 'provider raw detail', token: 'secret-token' } }
    };
    throw error;
  };
  console.error = (...args) => logs.push(args.join(' '));

  try {
    const result = await AIPlatformService.queryPlatform('deepseek', '测试问题');
    assert.equal(result.success, false);
    assert.equal(logs.some((line) => line.includes('status 400')), true);
    assert.equal(logs.some((line) => line.includes('secret-token')), false);
    assert.equal(logs.some((line) => line.includes('provider raw detail')), false);
  } finally {
    axios.post = originalPost;
    console.error = originalError;
    AIPlatformService.platforms.deepseek.apiKey = originalApiKey;
    AIPlatformService.platforms.deepseek.headers = originalHeaders;
  }
});

function restoreEnv(key, value) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

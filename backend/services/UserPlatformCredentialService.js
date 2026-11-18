const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const axios = require('axios');
const { UserPlatformCredential } = require('../models');
const catalog = require('../config/providerCatalog');
const { getMonitoringPlatforms } = require('../config/monitoringPlatforms');
const ResultParserService = require('./ResultParserService');
const KimiSearchService = require('./KimiSearchService');

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

class UserPlatformCredentialService {
  getEncryptionKey(create = false) {
    const configured = process.env.PLATFORM_CREDENTIAL_ENCRYPTION_KEY;
    if (configured) {
      if (!/^[a-f0-9]{64}$/i.test(configured)) throw new Error('Invalid credential encryption key');
      return Buffer.from(configured, 'hex');
    }
    const keyFile = path.resolve(__dirname, '../.platform-credential-key');
    if (!fs.existsSync(keyFile)) {
      if (!create) throw new Error('Credential encryption key is missing');
      try { fs.writeFileSync(keyFile, crypto.randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 }); }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
    }
    const value = fs.readFileSync(keyFile, 'utf8').trim();
    if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error('Invalid credential encryption key');
    return Buffer.from(value, 'hex');
  }

  encrypt(apiKey, userId, platform) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.getEncryptionKey(true), iv);
    cipher.setAAD(Buffer.from(`${userId}:${platform}`));
    const data = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), data].map((item) => item.toString('base64')).join('.');
  }

  decrypt(value, userId, platform) {
    const [iv, tag, data] = value.split('.').map((item) => Buffer.from(item, 'base64'));
    const cipher = crypto.createDecipheriv('aes-256-gcm', this.getEncryptionKey(), iv);
    cipher.setAAD(Buffer.from(`${userId}:${platform}`));
    cipher.setAuthTag(tag);
    return Buffer.concat([cipher.update(data), cipher.final()]).toString('utf8');
  }

  normalize(platform, input) {
    if (!getMonitoringPlatforms().includes(platform) || !catalog[platform]) fail('不支持的监测平台');
    const apiKey = typeof input?.api_key === 'string' ? input.api_key.trim() : '';
    const model = typeof input?.model === 'string' ? input.model.trim() : catalog[platform].model;
    if (apiKey.length < 12 || apiKey.length > 512 || /\s|[^\x21-\x7E]/.test(apiKey)) fail('请输入有效的 API 密钥');
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,119}$/.test(model)) fail('请输入有效的模型 ID');
    return { apiKey, model };
  }

  safeValidationError(error) {
    const status = error.response?.status;
    const code = String(error.response?.data?.error?.code || error.response?.data?.code || '').toLowerCase();
    if (/insufficient|overdue|arrear|balance/.test(code)) return '账号余额或可用额度不足，请处理后重新校验';
    if (status === 401) return '密钥校验失败，请检查密钥是否正确或已失效';
    if (status === 402) return '账号余额不足，请充值后重新校验';
    if (status === 403 || status === 404) return '无法使用该模型或联网搜索，请检查模型 ID、开通状态及密钥权限';
    if (status === 429) return '平台额度不足或请求过于频繁，请稍后重试';
    if (status === 400) return '平台拒绝了请求，请检查模型 ID 是否支持联网搜索及账号状态';
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') return '校验超时，请稍后重试';
    return '暂时无法连接平台完成校验，请检查网络后重试';
  }

  async validate(platform, apiKey, model, transport = axios) {
    const provider = catalog[platform];
    const config = {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      timeout: 45000, maxRedirects: 0, maxContentLength: 2 * 1024 * 1024
    };
    // Exercise the same model and search API used for monitoring, rather than just checking key format.
    const request = platform === 'doubao' ? {
      model, input: [{ role: 'user', content: [{ type: 'input_text', text: '请回复：连接成功。' }] }],
      tools: [{ type: 'web_search' }], max_output_tokens: 512
    } : {
      model, messages: [{ role: 'user', content: '请回复：连接成功。' }], max_tokens: platform === 'kimi' ? 4096 : 512,
      ...(platform === 'kimi' ? KimiSearchService.modelParameters(model) : {}),
      ...(platform === 'qianwen' ? { enable_search: true, search_options: { enable_source: true } } : {})
    };
    try {
      const response = await transport.post(provider.apiUrl, request, config);
      if (!ResultParserService.extractResponseText(response.data)?.trim()) fail('平台未返回有效回答，请检查所选模型后重试', 422);
      if (platform === 'deepseek') {
        const search = await transport.post(provider.searchUrl, { query: 'DeepSeek 官方', count: 1 }, config);
        if (!Array.isArray(search.data?.results) || search.data.error || search.data.success === false) fail('联网搜索校验未通过，请检查账号权限', 422);
      }
      if (platform === 'kimi') {
        const search = await transport.post(provider.searchUrl, { ...KimiSearchService.buildSearchRequest('Kimi 官方'), limit: 1 }, config);
        try { KimiSearchService.normalizeResults(search.data, 1); }
        catch (_) { fail('联网搜索校验未通过，请检查账号权限', 422); }
      }
    } catch (error) {
      if (error.status === 422) throw error;
      fail(this.safeValidationError(error), 422);
    }
  }

  async verifyAndSave({ userId, platform, input, transport = axios }) {
    const { apiKey, model } = this.normalize(platform, input);
    await this.validate(platform, apiKey, model, transport);
    await UserPlatformCredential.upsert({
      user_id: userId, platform, model, encrypted_key: this.encrypt(apiKey, userId, platform),
      key_suffix: apiKey.slice(-4), verified_at: new Date()
    });
    return this.list(userId);
  }

  async list(userId) {
    const rows = await UserPlatformCredential.findAll({ where: { user_id: userId }, raw: true });
    return getMonitoringPlatforms().map((platform) => {
      const row = rows.find((item) => item.platform === platform);
      const provider = catalog[platform];
      return { platform, name: provider.name, apiUrl: provider.apiUrl, console_url: provider.consoleUrl,
        model: row?.model || provider.model, configured: Boolean(row), ok: Boolean(row?.verified_at),
        masked_key: row ? `••••${row.key_suffix}` : '', verified_at: row?.verified_at || null,
        message: row?.verified_at ? '已校验，可使用' : (row ? '校验已失效，请重新校验' : '未配置，请先校验并保存密钥') };
    });
  }

  async loadConfigs(userId) {
    if (!Number.isSafeInteger(Number(userId)) || Number(userId) <= 0) return {};
    const rows = await UserPlatformCredential.unscoped().findAll({ where: { user_id: userId }, raw: true });
    const configs = {};
    for (const row of rows) {
      if (!row.verified_at || !getMonitoringPlatforms().includes(row.platform)) continue;
      const provider = catalog[row.platform];
      const apiKey = this.decrypt(row.encrypted_key, userId, row.platform);
      configs[row.platform] = { ...provider, model: row.model, apiKey,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }, userCredential: true };
    }
    return configs;
  }

  async remove(userId, platform) {
    if (!catalog[platform]) fail('不支持的监测平台');
    await UserPlatformCredential.destroy({ where: { user_id: userId, platform } });
  }
}

module.exports = new UserPlatformCredentialService();

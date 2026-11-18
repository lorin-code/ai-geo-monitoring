const axios = require('axios');
const https = require('https');
const DeepSeekSearchService = require('./DeepSeekSearchService');
const KimiSearchService = require('./KimiSearchService');
const { getMonitoringPlatforms } = require('../config/monitoringPlatforms');
const MAINLAND_MONITORING_PLATFORMS = getMonitoringPlatforms();
const UserPlatformContext = require('./UserPlatformContext');
const catalog = require('../config/providerCatalog');
let HttpsProxyAgent;
try {
  const proxyAgentModule = require('https-proxy-agent');
  HttpsProxyAgent = proxyAgentModule.HttpsProxyAgent || proxyAgentModule;
} catch (_) {
  // 代理模块可选，未安装则忽略
}

class AIPlatformService {
  constructor() {
    this.unconfiguredPlatforms = {
      doubao: {
        name: '豆包',
        apiUrl: process.env.DOUBAO_API_URL || 'https://ark.cn-beijing.volces.com/api/v3/responses',
        apiKey: undefined,
        headers: {
          'Content-Type': 'application/json',
        }
      },
      deepseek: {
        name: 'DeepSeek',
        apiUrl: process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions',
        apiKey: undefined,
        headers: {
          'Content-Type': 'application/json',
        }
      },
      kimi: {
        name: 'Kimi',
        apiUrl: catalog.kimi.apiUrl,
        apiKey: undefined,
        headers: {
          'Content-Type': 'application/json',
        }
      },
      qianwen: {
        name: '千问',
        apiUrl: catalog.qianwen.apiUrl,
        apiKey: undefined,
        headers: {
          'Content-Type': 'application/json',
        }
      }
  };
  }

  get platforms() {
    return this.userConfigs || UserPlatformContext.get()?.configs || this.unconfiguredPlatforms;
  }

  async forUser(userId) {
    const scoped = Object.create(this);
    scoped.userConfigs = await require('./UserPlatformCredentialService').loadConfigs(userId);
    return scoped;
  }

  async queryPlatform(platform, question, options = {}) {
    if (!MAINLAND_MONITORING_PLATFORMS.includes(platform)) {
      return { success: false, error: `未启用的AI平台: ${platform}`, platform };
    }
    const platformConfig = this.platforms[platform];
    if (!platformConfig) {
      return { success: false, error: `不支持的AI平台: ${platform}`, platform };
    }
    if (!platformConfig.apiKey) {
      return { success: false, error: `${platformConfig.name} API密钥未配置`, platform };
    }

    const requestData = this.buildRequestData(platform, question, options);
    const requestUrl = this.getApiUrl(platform);

    if (!this.isSearchEnabled(platform, options)) {
      const result = await this.requestPlatform(platform, requestUrl, requestData);
      if (platform === 'qianwen' && result.success && options.search !== false) {
        result.data = require('./QianwenSearchService').attachCitations(result.data);
      }
      return result;
    }

    try {
      const searchService = platform === 'kimi' ? KimiSearchService : DeepSeekSearchService;
      const searchRequest = searchService.buildSearchRequest(question);
      const searchResult = await this.requestPlatform(
        platform,
        platform === 'kimi' ? catalog.kimi.searchUrl : (platformConfig.userCredential ? catalog.deepseek.searchUrl : DeepSeekSearchService.getApiUrl(requestUrl)),
        searchRequest
      );
      if (!searchResult.success) return searchResult;
      const results = searchService.normalizeResults(searchResult.data, searchRequest.count || searchRequest.limit);
      requestData.messages = searchService.buildMessages(question, results);
      const answer = await this.requestPlatform(platform, requestUrl, requestData);
      if (!answer.success) return answer;
      return {
        ...answer,
        data: searchService.attachSearchMetadata(answer.data, results, searchRequest.query || searchRequest.text_query),
        responseTime: searchResult.responseTime + answer.responseTime
      };
    } catch (error) {
      return { success: false, error: `[${platform}] ${error.message}`, platform };
    }
  }

  isSearchEnabled(platform, options = {}) {
    if (platform === 'kimi') return options.search !== false;
    return platform === 'deepseek'
      && options.search !== false
      && String(process.env.DEEPSEEK_SEARCH_ENABLED || 'true').trim().toLowerCase() !== 'false';
  }

  async requestPlatform(platform, requestUrl, requestData) {
    const platformConfig = this.platforms[platform];

    // 加强重试：处理超时/网络类错误与 429 限流
    const MAX_ATTEMPTS = 4;
    let lastError = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const startedAt = Date.now();
        // 构建可选代理 Agent（支持 HTTPS_PROXY / HTTP_PROXY / PROXY_URL）
        const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.PROXY_URL;
        let agent = new https.Agent({ keepAlive: true });
        if (proxyUrl && HttpsProxyAgent) {
          try { agent = new HttpsProxyAgent(proxyUrl); } catch (e) { console.warn('代理初始化失败:', e.message); }
        } else if (proxyUrl && !HttpsProxyAgent) {
          console.warn('未安装 https-proxy-agent，忽略代理设置');
        }
        const response = await axios.post(requestUrl, requestData, {
          headers: {
            ...platformConfig.headers,
            'Accept': 'application/json'
          },
          maxRedirects: 0,
          // 长回复可能耗时较长，提升超时时间
          timeout: 90000,
          // 放开响应/请求大小限制，避免长文本触发中断
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
          proxy: false,
          decompress: true,
          httpsAgent: agent
        });
        const headerResponseTime = Number(response.headers?.['x-response-time']);
        const responseTime = Number.isFinite(headerResponseTime) && headerResponseTime >= 0
          ? headerResponseTime
          : Math.max(0, Date.now() - startedAt);
        return {
          success: true,
          data: response.data,
          platform,
          responseTime
        };
      } catch (error) {
        lastError = error;
        const code = error.code || '';
        const status = error.response?.status;
        const data = error.response?.data;
        const hint = code === 'ENOTFOUND' ? ' • DNS解析失败，请配置代理或检查网络连接' : '';
        const providerErrorCode = this.extractProviderErrorCode(data);
        const providerDetail = providerErrorCode ? ` provider_code=${providerErrorCode}` : '';
        const summary = `[${platform}] ${code} ${error.message}` + (status ? ` (status ${status})` : '') + providerDetail + hint;
        console.error('平台调用失败:', summary, data ? 'response: [redacted]' : '');
        const retryable = code === 'ECONNABORTED' || code === 'ENOTFOUND' || code === 'ECONNRESET' || status === 408 || status === 429 || (status && status >= 500);
        if (attempt < MAX_ATTEMPTS && retryable) {
          // 处理 429: 尊重 Retry-After，否则指数退避 + 随机抖动
          const retryAfter = parseInt(error.response?.headers?.['retry-after'] || '0', 10);
          const baseDelay = Math.min(5000, 1000 * Math.pow(2, attempt));
          const jitter = Math.floor(Math.random() * 500);
          const delay = retryAfter > 0 ? retryAfter * 1000 : (baseDelay + jitter);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        return { success: false, error: summary, platform };
      }
    }
    return { success: false, error: lastError?.message || '未知错误', platform };
  }

  extractProviderErrorCode(data) {
    if (!data || typeof data !== 'object') return '';
    const candidates = [
      data.error?.code,
      data.error?.type,
      data.errorCode,
      data.code,
      data.type
    ];
    const value = candidates
      .map((item) => String(item || '').trim())
      .find(Boolean);
    if (!value) return '';
    return value.replace(/[^a-zA-Z0-9_.:-]/g, '').slice(0, 80);
  }

  getApiUrl(platform) {
    const platformConfig = this.platforms[platform];
    const configuredUrl = platformConfig?.apiUrl || '';
    if (platformConfig?.userCredential) return configuredUrl;
    if (platform !== 'doubao') return configuredUrl;

    const responsesUrl = process.env.DOUBAO_RESPONSES_API_URL?.trim();
    if (responsesUrl) return responsesUrl;
    return configuredUrl.replace(/\/chat\/completions\/?$/i, '/responses');
  }

  buildRequestData(platform, question, options = {}) {
    if (platform === 'doubao') {
      return {
        model: this.getDoubaoResponsesModel(),
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: question }
            ]
          }
        ],
        tools: options.search === false ? [] : [
          { type: 'web_search' }
        ],
        temperature: 0.7,
        max_output_tokens: this.getMaxTokens(platform)
      };
    }

    return {
      model: this.getModelName(platform),
      messages: [{ role: 'user', content: question }],
      ...(platform === 'kimi' ? KimiSearchService.modelParameters(this.getModelName(platform)) : { temperature: 0.7 }),
      max_tokens: this.getMaxTokens(platform),
      ...(platform === 'qianwen' && options.search !== false
        ? { enable_search: true, search_options: { enable_source: true, enable_citation: true, citation_format: '[ref_<number>]' } } : {})
    };
  }

  getDoubaoResponsesModel() {
    if (this.platforms.doubao?.userCredential) return this.platforms.doubao.model;
    const configuredModel = process.env.DOUBAO_RESPONSES_MODEL?.trim();
    if (configuredModel) return configuredModel;
    return 'doubao-seed-1-6-250615';
  }

  // 获取平台对应的模型名称
  getModelName(platform) {
    if (this.platforms[platform]?.userCredential) return this.platforms[platform].model;
    const defaults = {
      // Ark 官方示例模型
      doubao: 'doubao-1-5-pro-32k-250115',
      deepseek: 'deepseek-chat',
      kimi: catalog.kimi.model,
      qianwen: 'qwen-turbo'
    };
    const key = String(platform || '').toUpperCase() + '_MODEL';
    const configuredModel = process.env[key]?.trim();
    if (configuredModel) return configuredModel;
    return defaults[platform] || 'default';
  }

  // 获取最大输出 token 配置（优先平台专属，其次全局，默认 4096）
  getMaxTokens(platform) {
    const envKey = String(platform).toUpperCase() + '_MAX_TOKENS';
    const platformMax = parseInt(process.env[envKey] || '0', 10);
    if (platformMax > 0) return platformMax;
    const globalMax = parseInt(process.env.AI_MAX_TOKENS || '0', 10);
    if (globalMax > 0) return globalMax;
    return 4096;
  }

  // 批量查询多个平台
  async queryMultiplePlatforms(platforms, question) {
    const promises = platforms.map(platform => 
      this.queryPlatform(platform, question)
    );
    
    const results = await Promise.allSettled(promises);
    
    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          success: false,
          error: result.reason.message,
          platform: platforms[index]
        };
      }
    });
  }

  // 获取可用的平台列表
  getAvailablePlatforms() {
    return MAINLAND_MONITORING_PLATFORMS.filter(platform => this.platforms[platform]?.apiKey);
  }
}

module.exports = new AIPlatformService();

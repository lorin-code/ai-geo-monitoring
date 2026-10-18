const axios = require('axios');
const https = require('https');
const DeepSeekSearchService = require('./DeepSeekSearchService');
const MAINLAND_MONITORING_PLATFORMS = ['doubao', 'deepseek'];
let HttpsProxyAgent;
try {
  const proxyAgentModule = require('https-proxy-agent');
  HttpsProxyAgent = proxyAgentModule.HttpsProxyAgent || proxyAgentModule;
} catch (_) {
  // 代理模块可选，未安装则忽略
}

class AIPlatformService {
  constructor() {
    this.platforms = {
      doubao: {
        name: '豆包',
        apiUrl: process.env.DOUBAO_API_URL || 'https://ark.cn-beijing.volces.com/api/v3/responses',
        apiKey: process.env.DOUBAO_API_KEY,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.DOUBAO_API_KEY}`
        }
      },
      deepseek: {
        name: 'DeepSeek',
        apiUrl: process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions',
        apiKey: process.env.DEEPSEEK_API_KEY,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
        }
      },
      kimi: {
        name: 'Kimi',
        apiUrl: process.env.KIMI_API_URL || 'https://api.kimi.com/v1/chat',
        apiKey: process.env.KIMI_API_KEY,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.KIMI_API_KEY}`
        }
      },
      qianwen: {
        name: '千问',
        apiUrl: process.env.QIANWEN_API_URL || 'https://api.qianwen.com/v1/chat',
        apiKey: process.env.QIANWEN_API_KEY,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.QIANWEN_API_KEY}`
        }
      }
  };
  }

  async queryPlatform(platform, question, options = {}) {
    const platformConfig = this.platforms[platform];
    if (!platformConfig) {
      return { success: false, error: `不支持的AI平台: ${platform}`, platform };
    }
    if (!platformConfig.apiKey) {
      return { success: false, error: `${platformConfig.name} API密钥未配置`, platform };
    }

    const requestData = this.buildRequestData(platform, question);
    const requestUrl = this.getApiUrl(platform);

    if (!this.isSearchEnabled(platform, options)) {
      return this.requestPlatform(platform, requestUrl, requestData);
    }

    try {
      const searchRequest = DeepSeekSearchService.buildSearchRequest(question);
      const searchResult = await this.requestPlatform(
        platform,
        DeepSeekSearchService.getApiUrl(requestUrl),
        searchRequest
      );
      if (!searchResult.success) return searchResult;
      const results = DeepSeekSearchService.normalizeResults(searchResult.data, searchRequest.count);
      requestData.messages = DeepSeekSearchService.buildMessages(question, results);
      const answer = await this.requestPlatform(platform, requestUrl, requestData);
      if (!answer.success) return answer;
      return {
        ...answer,
        data: DeepSeekSearchService.attachSearchMetadata(answer.data, results, searchRequest.query),
        responseTime: searchResult.responseTime + answer.responseTime
      };
    } catch (error) {
      return { success: false, error: `[${platform}] ${error.message}`, platform };
    }
  }

  isSearchEnabled(platform, options = {}) {
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
    if (platform !== 'doubao') return configuredUrl;

    const responsesUrl = process.env.DOUBAO_RESPONSES_API_URL?.trim();
    if (responsesUrl) return responsesUrl;
    return configuredUrl.replace(/\/chat\/completions\/?$/i, '/responses');
  }

  buildRequestData(platform, question) {
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
        tools: [
          { type: 'web_search' }
        ],
        temperature: 0.7,
        max_output_tokens: this.getMaxTokens(platform)
      };
    }

    return {
      model: this.getModelName(platform),
      messages: [{ role: 'user', content: question }],
      temperature: 0.7,
      max_tokens: this.getMaxTokens(platform)
    };
  }

  getDoubaoResponsesModel() {
    const configuredModel = process.env.DOUBAO_RESPONSES_MODEL?.trim();
    if (configuredModel) return configuredModel;
    return 'doubao-seed-1-6-250615';
  }

  // 获取平台对应的模型名称
  getModelName(platform) {
    const defaults = {
      // Ark 官方示例模型
      doubao: 'doubao-1-5-pro-32k-250115',
      deepseek: 'deepseek-chat',
      kimi: 'kimi-chat',
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

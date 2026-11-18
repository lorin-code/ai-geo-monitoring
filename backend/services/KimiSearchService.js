const shared = require('./DeepSeekSearchService');

// Official Search Basic protocol: https://platform.kimi.com/docs/api/tools-search
class KimiSearchService {
  buildSearchRequest(question) {
    const text_query = String(question || '').replace(/\s+/g, ' ').trim();
    if (!text_query) throw new Error('Kimi 搜索词不能为空');
    return { text_query, limit: 5, timeout_seconds: 30 };
  }

  modelParameters(model) {
    // Current Kimi models reject custom temperature; K3 always reasons.
    return /^kimi-k3(?:[.-]|$)/.test(model) ? { reasoning_effort: 'low' } : {};
  }

  normalizeResults(data, count = 5) {
    if (data?.error || !Array.isArray(data?.search_results)) throw new Error('Kimi 搜索响应格式无效');
    return shared.normalizeResults({ results: data.search_results }, count);
  }

  buildMessages(question, results) { return shared.buildMessages(question, results); }

  attachSearchMetadata(data, results, query) {
    const { deepseek_search, ...answer } = shared.attachSearchMetadata(data, results, query);
    return { ...answer, kimi_search: deepseek_search };
  }
}

module.exports = new KimiSearchService();

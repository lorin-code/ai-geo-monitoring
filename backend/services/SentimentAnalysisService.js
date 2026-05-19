const AIPlatformService = require('./AIPlatformService');
const ResultParserService = require('./ResultParserService');

const VALID_SENTIMENTS = new Set(['positive', 'neutral', 'negative']);
const SENTIMENT_UNAVAILABLE_REASON = '情绪判定暂不可用';

class SentimentAnalysisService {
  buildAnalysisQuestion({ responseText, brand, competitors }) {
    const brandName = brand?.name || '该品牌';
    const aliases = Array.isArray(brand?.aliases) ? brand.aliases.filter(Boolean) : [];
    const primaryKeywords = Array.isArray(brand?.primary_keywords)
      ? brand.primary_keywords.map((item) => String(item || '').trim()).filter(Boolean)
      : [];
    const competitorNames = Array.isArray(competitors)
      ? competitors.flatMap((item) => [
        item?.name,
        ...(Array.isArray(item?.aliases) ? item.aliases : [])
      ])
        .map((item) => String(item || '').trim())
        .filter(Boolean)
        .filter((item, index, rows) => rows.findIndex((row) => row.toLowerCase() === item.toLowerCase()) === index)
      : [];

    return [
      '你是中国大陆市场的 GEO（生成式搜索优化）分析师。',
      '请基于以下 AI 回答，判断回答对目标品牌的情绪态度。',
      `品牌：${brandName}`,
      aliases.length ? `品牌别名：${aliases.join('、')}` : '',
      primaryKeywords.length ? `品牌核心关键词：${primaryKeywords.join('、')}` : '',
      competitorNames.length ? `主要竞品：${competitorNames.join('、')}` : '',
      '判定规则：',
      '- positive：回答明确推荐、认可、强调品牌优势，或把品牌列为优先选择。',
      '- negative：回答明确不推荐、质疑、强调风险/缺点，或明显认为竞品更优。',
      '- neutral：只是客观提及、信息不足、正负混合且没有明确倾向。',
      '只判断目标品牌，不要把竞品评价误判为目标品牌情绪。',
      '只返回 JSON 对象，不要 Markdown，不要解释。',
      '格式：{"sentiment":"positive|neutral|negative","reason":"20字以内中文原因","risk_terms":["风险词"]}',
      `AI 回答：${String(responseText || '').slice(0, 6000)}`
    ].filter(Boolean).join('\n');
  }

  parseAnalysis(text) {
    const raw = String(text || '').trim();
    if (!raw) return this.neutral(SENTIMENT_UNAVAILABLE_REASON);

    const withoutFence = raw.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    const jsonText = this.extractJsonObject(withoutFence);
    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (_) {
      return this.neutral(SENTIMENT_UNAVAILABLE_REASON);
    }

    const sentiment = this.normalizeSentiment(parsed?.sentiment);
    const reason = this.sanitizeReason(parsed?.reason);
    const riskTerms = this.normalizeRiskTerms(parsed?.risk_terms);

    return {
      sentiment,
      reason,
      risk_terms: riskTerms
    };
  }

  normalizeSentiment(value) {
    const text = String(value || '').trim().toLowerCase();
    const map = {
      正向: 'positive',
      积极: 'positive',
      正面: 'positive',
      中性: 'neutral',
      中立: 'neutral',
      客观: 'neutral',
      负向: 'negative',
      消极: 'negative',
      负面: 'negative'
    };
    if (VALID_SENTIMENTS.has(text)) return text;
    if (map[text]) return map[text];
    if (/偏负|负面|负向|消极/.test(text)) return 'negative';
    if (/偏正|正面|正向|积极/.test(text)) return 'positive';
    if (/中性|中立|客观/.test(text)) return 'neutral';
    return 'neutral';
  }

  normalizeRiskTerms(value) {
    const rows = Array.isArray(value) ? value : (value ? String(value).split(/[,，、;；/]/) : []);
    return rows
      .map((item) => String(item || '').trim())
      .map((item) => this.sanitizeRiskTerm(item))
      .filter(Boolean)
      .slice(0, 10);
  }

  extractJsonObject(text) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) return text.slice(start, end + 1);
    return text;
  }

  neutral(reason) {
    return { sentiment: 'neutral', reason, risk_terms: [] };
  }

  sanitizeReason(value) {
    const cleaned = String(value || '')
      .replace(/DeepSeek/ig, '')
      .replace(/API\s*Key/ig, '')
      .replace(/API/ig, '')
      .replace(/\s+/g, '')
      .trim();
    return (cleaned || '情绪判定完成').slice(0, 20);
  }

  sanitizeRiskTerm(value) {
    return String(value || '')
      .replace(/DeepSeek/ig, '')
      .replace(/API\s*Key/ig, '')
      .replace(/API/ig, '')
      .replace(/\s+/g, '')
      .trim()
      .slice(0, 14);
  }

  async analyzeWithDeepSeek({ responseText, brand, competitors }) {
    if (!AIPlatformService.platforms.deepseek?.apiKey) {
      return this.neutral(SENTIMENT_UNAVAILABLE_REASON);
    }

    const question = this.buildAnalysisQuestion({ responseText, brand, competitors });
    let result;
    try {
      result = await AIPlatformService.queryPlatform('deepseek', question);
    } catch (error) {
      console.warn('DeepSeek 情绪判定异常:', error?.message || error);
      return this.neutral(SENTIMENT_UNAVAILABLE_REASON);
    }
    if (!result.success) {
      console.warn('DeepSeek 情绪判定失败:', result.error);
      return this.neutral(SENTIMENT_UNAVAILABLE_REASON);
    }

    const outputText = ResultParserService.extractResponseText(result.data);
    return this.parseAnalysis(outputText);
  }
}

module.exports = new SentimentAnalysisService();

const PromptCategoryService = require('./PromptCategoryService');
const VisibilityAnalysisService = require('./VisibilityAnalysisService');

class PromptSuggestionService {
  MIN_SUGGESTION_COUNT = 3;
  MAX_SUGGESTION_COUNT = 100;
  DEEPSEEK_BATCH_SIZE = 20;
  MAX_TOP_UP_BATCHES = 3;

  normalizeCount(count) {
    const numeric = Number(count);
    const safeCount = Number.isFinite(numeric) ? Math.floor(numeric) : 10;
    return Math.max(this.MIN_SUGGESTION_COUNT, Math.min(this.MAX_SUGGESTION_COUNT, safeCount));
  }

  buildGenerationBatches(count) {
    const total = this.normalizeCount(count);
    const batches = [];
    let remaining = total;
    while (remaining > 0) {
      const batchCount = Math.min(this.DEEPSEEK_BATCH_SIZE, remaining);
      batches.push(batchCount);
      remaining -= batchCount;
    }
    return batches;
  }

  buildGenerationQuestion(project, competitors, options = {}) {
    const count = this.normalizeCount(options.count);
    const brandName = project?.name || '该品牌';
    const aliases = Array.isArray(project?.aliases) ? project.aliases.filter(Boolean) : [];
    const { genericKeywords, brandSpecificKeywords } = this.groupProjectKeywords(project);
    const competitorNames = Array.isArray(competitors)
      ? competitors.flatMap((item) => [
        item?.name,
        ...(Array.isArray(item?.aliases) ? item.aliases : [])
      ])
        .map((item) => String(item || '').trim())
        .filter(Boolean)
        .filter((item, index, rows) => rows.findIndex((row) => row.toLowerCase() === item.toLowerCase()) === index)
      : [];
    const platformLabels = { doubao: '豆包', deepseek: 'DeepSeek' };
    const platforms = (Array.isArray(project?.platforms) && project.platforms.length ? project.platforms : ['doubao', 'deepseek'])
      .map((item) => platformLabels[String(item).trim().toLowerCase()])
      .filter(Boolean);
    const focus = String(options.focus || '').trim();
    const excludeQuestions = Array.isArray(options.excludeQuestions)
      ? options.excludeQuestions.map((item) => String(item || '').trim()).filter(Boolean).slice(-60)
      : [];

    return [
      '你是中国大陆市场的 GEO（生成式搜索优化）分析师。',
      `请生成 ${count} 条适合在${platforms.join('和')}中长期追踪的中文真实用户问题，用于评估行业、品类和竞品场景下的 AI 品牌可见度。`,
      `目标品牌：${brandName}`,
      aliases.length ? `品牌别名：${aliases.join('、')}` : '',
      project?.industry ? `行业：${project.industry}` : '',
      genericKeywords.length ? `行业/场景核心关键词：${genericKeywords.join('、')}` : '',
      brandSpecificKeywords.length ? `品牌专属词/产品型号：${brandSpecificKeywords.join('、')}` : '',
      competitorNames.length ? `主要竞品：${competitorNames.join('、')}` : '',
      focus ? `本次重点：${focus}` : '',
      options.totalCount ? `本次总目标：${this.normalizeCount(options.totalCount)} 条；当前只生成本批 ${count} 条。` : '',
      excludeQuestions.length ? `已生成过的问题不要重复：${excludeQuestions.join('；')}` : '',
      '生成比例必须接近：60% 行业、场景、品类或非品牌专属核心关键词问题；25% 竞品、替代方案或对比问题；15% 品牌直问问题。',
      '非“品牌直问”问题的 question 禁止出现品牌名、品牌别名、品牌专属产品词或型号；可以出现通用行业词、品类词或非品牌专属核心关键词。',
      '品牌直问问题最多占 15%，不要每条都直接询问该品牌或品牌专属产品。',
      '问题要覆盖购买决策、竞品对比、替代方案、价格/成本、产品适配、风险顾虑、口碑评价。',
      '至少一半问题必须围绕行业场景或核心关键词，而不是只围绕品牌名。',
      '每条问题都要像真实用户会输入给 AI 的短句，不要写成关键词。',
      '每条 question 控制在 8 到 28 个中文字符，不要加入用户身份、背景条件或多重从句。',
      '不要强制在 question 末尾添加问号；除非表达自然需要，否则用无标点短句。',
      '优先输出类似“静音轮胎怎么选”“新能源车轮胎推荐”“马牌和日系轮胎哪个好”这种一眼能读完的问题。',
      '只返回 JSON 数组，不要 Markdown，不要解释。数组元素格式为 {"question":"...","tags":["购买决策"]}。'
    ].filter(Boolean).join('\n');
  }

  async generateSuggestions(project, competitors, options = {}) {
    const platform = options.platform || 'deepseek';
    const requestedCount = this.normalizeCount(options.count || 10);
    const batches = this.buildGenerationBatches(requestedCount);
    const queryPlatform = options.queryPlatform;
    const extractResponseText = options.extractResponseText || ((data) => String(data || ''));
    const baseExcludeQuestions = this.normalizeExcludeQuestions(options.excludeQuestions);
    if (typeof queryPlatform !== 'function') {
      throw new Error('queryPlatform is required');
    }

    const suggestionGroups = [];
    const rawResponses = [];
    for (let index = 0; index < batches.length; index += 1) {
      const generationQuestion = this.buildGenerationQuestion(
        project,
        competitors,
        {
          count: batches[index],
          totalCount: requestedCount,
          focus: options.focus,
          excludeQuestions: [
            ...baseExcludeQuestions,
            ...suggestionGroups.flat().map((item) => item.question)
          ]
        }
      );

      const result = await queryPlatform(platform, generationQuestion);
      if (!result.success) {
        return {
          success: false,
          platform,
          requested_count: requestedCount,
          batch_count: batches.length,
          batches,
          error: result.error,
          batch_index: index
        };
      }

      const responseText = extractResponseText(result.data);
      rawResponses.push(responseText);
      suggestionGroups.push(this.parseSuggestions(responseText, {
        project,
        requestedCount,
        excludeQuestions: baseExcludeQuestions,
        maxBrandQuestionRatio: options.maxBrandQuestionRatio ?? 0.15
      }));

      const mergedCount = this.mergeSuggestions(suggestionGroups, {
        project,
        requestedCount,
        excludeQuestions: baseExcludeQuestions,
        maxBrandQuestionRatio: options.maxBrandQuestionRatio ?? 0.15
      }).length;
      const remainingOriginalBatches = batches.slice(index + 1).reduce((sum, value) => sum + value, 0);
      const shortfall = requestedCount - mergedCount - remainingOriginalBatches;
      if (shortfall > 0 && batches.length < this.MAX_TOP_UP_BATCHES + this.buildGenerationBatches(requestedCount).length) {
        batches.push(Math.min(this.DEEPSEEK_BATCH_SIZE, shortfall));
      }
    }

    return {
      success: true,
      platform,
      requested_count: requestedCount,
      batch_count: batches.length,
      batches,
      suggestions: this.mergeSuggestions(suggestionGroups, {
        project,
        requestedCount,
        excludeQuestions: baseExcludeQuestions,
        maxBrandQuestionRatio: options.maxBrandQuestionRatio ?? 0.15
      }),
      raw_responses: rawResponses
    };
  }

  parseSuggestions(text, options = {}) {
    const raw = String(text || '').trim();
    if (!raw) return [];
    const withoutFence = raw.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    const jsonText = this.extractJsonPayload(withoutFence);
    let parsed;
    try {
      parsed = this.parseJsonSuggestions(withoutFence, jsonText);
    } catch (_) {
      parsed = this.parseJsonPayloads(withoutFence);
      if (!Array.isArray(parsed)) {
        return this.limitSuggestions(
          this.applyBrandLimit(this.parseLineFallback(raw, { ...options, skipLimit: true }), options),
          options
        );
      }
    }
    if (!Array.isArray(parsed)) return [];
    return this.limitSuggestions(
      this.applyBrandLimit(this.normalizeSuggestions(parsed, { ...options, skipLimit: true }), options),
      options
    );
  }

  parseJsonPayloads(text) {
    const payloads = this.extractJsonPayloads(text);
    let emptyArray = null;
    for (const payload of payloads) {
      try {
        const parsed = this.parseJsonSuggestions(payload, payload);
        if (Array.isArray(parsed) && parsed.length) return parsed;
        if (Array.isArray(parsed) && !emptyArray) emptyArray = parsed;
      } catch (_) {
        // Try the next complete JSON fragment.
      }
    }
    return emptyArray;
  }

  mergeSuggestions(suggestionGroups, options = {}) {
    const rows = (Array.isArray(suggestionGroups) ? suggestionGroups : [])
      .flat()
      .filter(Boolean);
    return this.limitSuggestions(
      this.applyBrandLimit(this.normalizeSuggestions(rows, { ...options, skipLimit: true }), options),
      options
    );
  }

  extractJsonPayload(text) {
    return this.extractJsonPayloads(text)[0] || String(text || '').trim();
  }

  extractJsonPayloads(text) {
    const source = String(text || '').trim();
    const payloads = [];
    const stack = [];
    let inString = false;
    let escaped = false;
    let start = -1;
    for (let index = 0; index < source.length; index += 1) {
      const char = source[index];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        if (start !== -1) inString = true;
      } else if (char === '[' || char === '{') {
        if (start === -1) start = index;
        stack.push(char);
      } else if (char === ']' || char === '}') {
        if (start === -1) continue;
        const opener = stack.pop();
        if ((char === ']' && opener !== '[') || (char === '}' && opener !== '{')) {
          stack.length = 0;
          start = -1;
          continue;
        }
        if (!stack.length) {
          payloads.push(source.slice(start, index + 1));
          start = -1;
        }
      }
    }
    return payloads;
  }

  parseJsonSuggestions(text, fallbackArrayText) {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object') {
      const candidates = [
        parsed.prompts,
        parsed.suggestions,
        parsed.questions,
        parsed.items,
        parsed.data,
        parsed.result,
        parsed.output
      ];
      for (const candidate of candidates) {
        if (Array.isArray(candidate)) return candidate;
        if (typeof candidate === 'string' && candidate.trim()) {
          try {
            const nested = this.parseJsonSuggestions(candidate.trim(), candidate.trim());
            if (Array.isArray(nested)) return nested;
          } catch (_) {
            // Non-JSON wrapper strings are metadata; keep looking for suggestions.
          }
        }
        if (candidate && typeof candidate === 'object') {
          const nested = this.pickSuggestionArray(candidate);
          if (nested) return nested;
        }
      }
    }
    if (fallbackArrayText && fallbackArrayText !== text) return JSON.parse(fallbackArrayText);
    return parsed;
  }

  pickSuggestionArray(value) {
    const keys = ['prompts', 'suggestions', 'questions', 'items'];
    for (const key of keys) {
      if (Array.isArray(value?.[key])) return value[key];
    }
    return null;
  }

  parseLineFallback(text, options = {}) {
    const rows = text
      .split(/\n+/)
      .map((line) => line.replace(/^\s*(?:[-*]\s*)?(?:(?:\d+[.、)）])|(?:[（(]\d+[）)]))\s*/u, '').trim())
      .filter(Boolean)
      .filter((line) => !this.isFallbackPreambleLine(line))
      .filter((line) => !this.isJsonFragmentLine(line))
      .map((question) => ({ question, tags: [] }));
    return this.normalizeSuggestions(rows, options);
  }

  isJsonFragmentLine(line) {
    const value = String(line || '').trim();
    return /^[\[{]/.test(value) || /"question"\s*:/.test(value) || /"tags"\s*:/.test(value);
  }

  isFallbackPreambleLine(line) {
    const value = String(line || '').trim();
    if (!value) return true;
    if (/^```/.test(value)) return true;
    return /^(以下|下面|这里|为你|已为你|生成|建议)(?:是|为|的)?.*(问题|prompt|Prompt|列表|结果|建议)[:：]?$/u.test(value);
  }

  normalizeSuggestions(items, options = {}) {
    const seen = new Set();
    const excluded = new Set(this.normalizeExcludeQuestions(options.excludeQuestions).map((item) => this.normalizeQuestionKey(item)));
    const limit = this.normalizeCount(options.requestedCount || options.count || items?.length || 10);
    const normalized = items
      .map((item) => {
        const question = this.normalizeQuestion(String(typeof item === 'string' ? item : item?.question || '').trim());
        const tags = this.normalizeTags(item?.tags);
        return { question, tags: tags.length ? tags : this.deriveTags(question) };
      })
      .filter((item) => {
        const key = this.normalizeQuestionKey(item.question);
        if (!item.question || excluded.has(key) || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
    return options.skipLimit === true ? normalized : normalized.slice(0, limit);
  }

  limitSuggestions(suggestions, options = {}) {
    const limit = this.normalizeCount(options.requestedCount || options.count || suggestions?.length || 10);
    return (Array.isArray(suggestions) ? suggestions : []).slice(0, limit);
  }

  normalizeTags(value) {
    const rows = Array.isArray(value) ? value : (value ? [value] : []);
    return rows
      .flatMap((tag) => String(tag || '').split(/[,，、;；/]/))
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 5);
  }

  deriveTags(question) {
    const category = PromptCategoryService.derive({ question });
    return [category === '未分类' ? '购买决策' : category];
  }

  normalizeExcludeQuestions(questions) {
    return (Array.isArray(questions) ? questions : [])
      .map((item) => this.normalizeQuestion(String(item || '').trim()))
      .filter(Boolean);
  }

  normalizeQuestionKey(question) {
    return this.normalizeQuestion(question)
      .replace(/\s+/g, '')
      .replace(/[？?。.!！]+$/g, '')
      .toLowerCase();
  }

  buildBrandTerms(project) {
    const seen = new Set();
    return VisibilityAnalysisService.buildBrandVisibilityTerms(project)
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .filter((item) => {
        const key = item.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  groupProjectKeywords(project) {
    const keywords = Array.isArray(project?.primary_keywords)
      ? project.primary_keywords.map((item) => String(item || '').trim()).filter(Boolean)
      : [];
    const brandTerms = this.buildBrandTerms(project);
    const genericKeywords = [];
    const brandSpecificKeywords = [];
    keywords.forEach((keyword) => {
      if (this.hasBrandTerm(keyword, brandTerms)) {
        brandSpecificKeywords.push(keyword);
      } else {
        genericKeywords.push(keyword);
      }
    });
    return { genericKeywords, brandSpecificKeywords };
  }

  hasBrandTerm(question, brandTerms) {
    const source = String(question || '').toLowerCase();
    const compactSource = this.compactTerm(source);
    return brandTerms.some((term) => {
      const normalized = String(term || '').toLowerCase();
      if (source.includes(normalized)) return true;
      const compact = this.compactTerm(normalized);
      return compact.length >= 3 && compactSource.includes(compact);
    });
  }

  compactTerm(term) {
    return String(term || '').toLowerCase().replace(/[\s._-]+/g, '');
  }

  applyBrandLimit(suggestions, options = {}) {
    const rows = Array.isArray(suggestions) ? suggestions : [];
    const brandTerms = this.buildBrandTerms(options.project);
    if (!brandTerms.length) return rows;

    const requestedCount = this.normalizeCount(options.requestedCount || options.count || rows.length || 10);
    const ratio = Number.isFinite(Number(options.maxBrandQuestionRatio))
      ? Number(options.maxBrandQuestionRatio)
      : 0.15;
    const maxBrandQuestions = Math.floor(requestedCount * ratio);
    let brandCount = 0;
    return rows.filter((item) => {
      if (!this.hasBrandTerm(item.question, brandTerms)) return true;
      if (brandCount >= maxBrandQuestions) return false;
      brandCount += 1;
      return true;
    });
  }

  normalizeQuestion(question) {
    const cleaned = String(question || '')
      .replace(/\s+/g, ' ')
      .replace(/^\s*(?:[-*]\s*)?(?:(?:\d+[.、)）])|(?:[（(]\d+[）)]))\s*/u, '')
      .replace(/^\s*(?:[一二三四五六七八九十]+[.、)）]|第\s*\d+\s*题\s*[:：.、]?|问题\s*\d+\s*[:：.、]?)\s*/u, '')
      .replace(/^\s*(?:问题|提问|问|q|question)\s*[:：]\s*/iu, '')
      .replace(/([\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])/g, '$1')
      .replace(/\b([A-Za-z]{1,3})\s+(?=[\u4e00-\u9fff])/g, '$1')
      .replace(/([\u4e00-\u9fff])\s+([A-Za-z]{1,3})\b/g, '$1$2')
      .replace(/^([^，,。！!；;？?]{1,20})\s*[，,]\s*([^，,。！!；;？?]{1,28}(?:哪个好|哪家好|更适合|更推荐|更值得|对比|区别|差异|优劣|替代|怎么选)[^，,。！!；;？?]*)/u, '$1和$2')
      .replace(/^([^，,。！!；;？?]{1,20})\s*[，,]\s*((?:怎么|如何|怎样|要不要|能不能|适不适合|贵不贵|好不好)[^，,。！!；;？?]{1,24})/u, '$1$2')
      .replace(/[。！!；;，,].*$/u, '')
      .trim();
    if (!cleaned) return '';
    const withoutMark = cleaned.replace(/[？?]+$/g, '');
    if (withoutMark.length <= 28) return withoutMark;
    return withoutMark.slice(0, 28);
  }
}

module.exports = new PromptSuggestionService();

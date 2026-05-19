const CitationAnalysisService = require('./CitationAnalysisService');
const ProjectMetricsService = require('./ProjectMetricsService');
const PromptCategoryService = require('./PromptCategoryService');

const SOURCE_TYPE_RULES = [
  { type: '社区问答', domains: ['zhihu.com', 'xiaohongshu.com', 'douban.com', 'tieba.baidu.com', 'reddit.com'] },
  { type: '电商平台', domains: ['jd.com', 'taobao.com', 'tmall.com', 'pinduoduo.com', 'suning.com'] },
  { type: '百科资料', domains: ['baike.baidu.com', 'wikipedia.org'] },
  { type: '视频内容', domains: ['bilibili.com', 'douyin.com', 'kuaishou.com', 'youtube.com'] },
  { type: '媒体内容', domains: ['36kr.com', 'huxiu.com', 'ifanr.com', 'sohu.com', 'sina.com.cn', 'qq.com', '163.com', 'baijiahao.baidu.com', 'toutiao.com', 'thepaper.cn'] }
];

class SourceAnalysisService {
  normalizeDomain(value) {
    return CitationAnalysisService.normalizeDomain(value);
  }

  sameOrSubdomain(domain, rootDomain) {
    return CitationAnalysisService.sameOrSubdomain(domain, rootDomain);
  }

  canonicalDomain(domain) {
    return String(domain || '').toLowerCase().replace(/^www\./, '');
  }

  isValidDomain(domain) {
    return CitationAnalysisService.isValidDomain(domain);
  }

  normalizeSourceUrl(value) {
    const rawUrl = String(value || '').trim();
    if (!rawUrl) return '';
    try {
      const candidate = CitationAnalysisService.normalizeCandidateUrl(rawUrl) || CitationAnalysisService.stripTrailingPunctuation(rawUrl);
      const normalized = CitationAnalysisService.normalizeUrl(candidate);
      return normalized;
    } catch (_) {
      return rawUrl;
    }
  }

  classifySource(source, context = {}) {
    const domain = this.normalizeDomain(source?.domain || source?.url);
    if (!domain) return '未知来源';
    if (source?.owned) return '自有来源';
    if (source?.competitor_owned) return '竞品来源';

    const brandDomain = this.normalizeDomain(context.brand?.website);
    if (this.sameOrSubdomain(domain, brandDomain)) return '自有来源';

    const competitorDomains = (Array.isArray(context.competitors) ? context.competitors : [])
      .map((item) => this.normalizeDomain(item?.website))
      .filter(Boolean);
    if (competitorDomains.some((item) => this.sameOrSubdomain(domain, item))) return '竞品来源';

    const matchedRule = SOURCE_TYPE_RULES.find((rule) =>
      rule.domains.some((root) => this.sameOrSubdomain(domain, root))
    );
    return matchedRule?.type || '第三方来源';
  }

  normalizeSource(source, context = {}) {
    const url = this.normalizeSourceUrl(source?.url);
    const hasUrlDomain = /^https?:\/\//i.test(url);
    const domainSource = hasUrlDomain ? url : (source?.domain || url);
    const domain = this.canonicalDomain(this.normalizeDomain(domainSource));
    if (!this.isValidDomain(domain)) return null;
    const sourceType = this.classifySource(hasUrlDomain ? { url, domain } : { ...source, url, domain }, context);
    return {
      url,
      domain,
      source_type: sourceType,
      owned: sourceType === '自有来源',
      competitor_owned: sourceType === '竞品来源'
    };
  }

  normalizeSources(sources, context = {}) {
    const seen = new Set();
    const normalized = (Array.isArray(sources) ? sources : [])
      .map((source) => this.normalizeSource(source, context))
      .filter(Boolean);
    const urlDomains = new Set(
      normalized
        .filter((source) => source.url)
        .map((source) => this.canonicalDomain(source.domain))
        .filter(Boolean)
    );
    return normalized
      .filter((source) => source.url || !urlDomains.has(this.canonicalDomain(source.domain)))
      .filter((source) => {
        const key = source.url ? `url:${source.url.toLowerCase()}` : `domain:${source.domain.toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  buildPromptCategoryLookup(prompts) {
    const lookup = new Map();
    for (const prompt of Array.isArray(prompts) ? prompts : []) {
      const id = prompt?.id;
      if (id === undefined || id === null) continue;
      lookup.set(String(id), PromptCategoryService.derive(prompt));
    }
    return lookup;
  }

  derivePromptCategory(row, context = {}) {
    const promptId = row?.prompt_id ?? row?.tracked_prompt_id;
    const lookup = context.promptCategoryLookup;
    if (promptId !== undefined && promptId !== null && lookup instanceof Map) {
      const category = lookup.get(String(promptId));
      if (category) return category;
    }
    return PromptCategoryService.derive({
      prompt_category: row?.prompt_category,
      question: row?.question,
      tags: row?.tags
    });
  }

  buildSourceRecords(metrics, context = {}) {
    const rows = Array.isArray(metrics) ? metrics : [];
    const records = [];
    const promptCategoryLookup = context.promptCategoryLookup instanceof Map
      ? context.promptCategoryLookup
      : this.buildPromptCategoryLookup(context.prompts);
    for (const row of rows) {
      const sources = this.normalizeSources(row?.citation_sources, context);
      const promptCategory = this.derivePromptCategory(row, { promptCategoryLookup });
      for (const source of sources) {
        records.push({
          platform: row.platform || 'unknown',
          prompt_id: row.prompt_id || null,
          prompt_category: promptCategory,
          source_type: source.source_type,
          domain: source.domain,
          url: source.url,
          created_at: row.created_at || row.createdAt || null,
          brand_mentioned: !!row.brand_mentioned
        });
      }
    }
    return records;
  }

  empty() {
    return {
      summary: {
        total_citations: 0,
        cited_responses: 0,
        owned_citations: 0,
        competitor_citations: 0,
        third_party_citations: 0,
        source_domain_count: 0
      },
      source_types: [],
      domains: [],
      urls: [],
      opportunities: [],
      source_changes: {
        new_domains: [],
        dropped_domains: [],
        retained_domains: [],
        new_urls: [],
        dropped_urls: [],
        retained_urls: []
      },
      records: []
    };
  }

  buildChangeBucket(records, keyField) {
    const bucket = new Map();
    for (const record of records) {
      const key = record?.[keyField];
      if (!key) continue;
      const entry = bucket.get(key) || {
        [keyField]: key,
        domain: record.domain,
        source_type: record.source_type,
        citation_count: 0,
        platforms: new Set(),
        categories: new Set(),
        last_seen_at: null
      };
      entry.citation_count += 1;
      if (record.platform) entry.platforms.add(record.platform);
      if (record.prompt_category) entry.categories.add(record.prompt_category);
      if (!entry.last_seen_at || new Date(record.created_at || 0) > new Date(entry.last_seen_at || 0)) {
        entry.last_seen_at = record.created_at || null;
      }
      bucket.set(key, entry);
    }
    return bucket;
  }

  serializeChangeEntries(entries, limit = 20) {
    return entries
      .map((item) => ({
        ...item,
        platforms: Array.from(item.platforms),
        categories: Array.from(item.categories)
      }))
      .sort((a, b) => (
        b.citation_count - a.citation_count
        || String(a.domain || '').localeCompare(String(b.domain || ''))
        || String(a.url || '').localeCompare(String(b.url || ''))
      ))
      .slice(0, limit);
  }

  buildSourceChanges(records, context = {}) {
    const rows = (Array.isArray(records) ? records : [])
      .filter((row) => row?.created_at && !Number.isNaN(new Date(row.created_at).getTime()));
    const window = ProjectMetricsService.buildPeriodWindow(context.days, {
      referenceDate: context.referenceDate
    });
    const referenceDate = window.periodEnd;
    if (Number.isNaN(referenceDate.getTime())) {
      return this.empty().source_changes;
    }
    const currentSince = window.periodStart;
    const previousSince = window.changePeriodStart;
    const previousRecords = rows.filter((row) => {
      const createdAt = new Date(row.created_at);
      return createdAt >= previousSince && createdAt < currentSince;
    });
    const currentRecords = rows.filter((row) => new Date(row.created_at) >= currentSince && new Date(row.created_at) <= referenceDate);

    const previousDomainMap = this.buildChangeBucket(previousRecords, 'domain');
    const currentDomainMap = this.buildChangeBucket(currentRecords, 'domain');
    const previousUrlMap = this.buildChangeBucket(previousRecords, 'url');
    const currentUrlMap = this.buildChangeBucket(currentRecords, 'url');

    const pickDiff = (currentMap, previousMap) => Array.from(currentMap.entries())
      .filter(([key]) => !previousMap.has(key))
      .map(([, value]) => value);
    const pickRetained = (currentMap, previousMap) => Array.from(currentMap.entries())
      .filter(([key]) => previousMap.has(key))
      .map(([, value]) => value);

    return {
      new_domains: this.serializeChangeEntries(pickDiff(currentDomainMap, previousDomainMap)),
      dropped_domains: this.serializeChangeEntries(pickDiff(previousDomainMap, currentDomainMap)),
      retained_domains: this.serializeChangeEntries(pickRetained(currentDomainMap, previousDomainMap)),
      new_urls: this.serializeChangeEntries(pickDiff(currentUrlMap, previousUrlMap)),
      dropped_urls: this.serializeChangeEntries(pickDiff(previousUrlMap, currentUrlMap)),
      retained_urls: this.serializeChangeEntries(pickRetained(currentUrlMap, previousUrlMap))
    };
  }

  buildPromptOpportunityFilter(context = {}) {
    const promptRows = Array.isArray(context.prompts) ? context.prompts : [];
    const promptLookup = new Map(
      promptRows
        .filter((item) => item?.id !== undefined && item?.id !== null)
        .map((item) => [String(item.id), item])
    );
    const hasPromptCatalog = promptLookup.size > 0;
    return (promptId) => {
      if (promptId === undefined || promptId === null || promptId === '') return true;
      const prompt = promptLookup.get(String(promptId));
      if (!prompt) return !hasPromptCatalog;
      return prompt.enabled !== false;
    };
  }

  summarize(metrics, context = {}) {
    const rows = Array.isArray(metrics) ? metrics : [];
    const promptCategoryLookup = this.buildPromptCategoryLookup(context.prompts);
    const changeRecords = Array.isArray(context.changeMetrics)
      ? this.buildSourceRecords(context.changeMetrics, { ...context, promptCategoryLookup })
      : null;
    const domainMap = new Map();
    const urlMap = new Map();
    const typeMap = new Map();
    const opportunities = [];
    const records = [];
    let totalCitations = 0;
    let citedResponses = 0;
    let ownedCitations = 0;
    let competitorCitations = 0;
    let thirdPartyCitations = 0;
    const isActionablePrompt = this.buildPromptOpportunityFilter(context);

    for (const row of rows) {
      const sources = this.normalizeSources(row?.citation_sources, context);
      if (!sources.length) continue;
      const promptCategory = this.derivePromptCategory(row, { promptCategoryLookup });

      citedResponses += 1;
      const responseTypes = new Set();
      const responseDomains = new Set();
      const responseUrls = new Set();
      const hasOwnedSource = sources.some((source) => source.owned);
      for (const source of sources) {
        totalCitations += 1;
        if (source.owned) ownedCitations += 1;
        else if (source.competitor_owned) competitorCitations += 1;
        else thirdPartyCitations += 1;

        const typeEntry = typeMap.get(source.source_type) || { type: source.source_type, citation_count: 0, response_count: 0, domains: new Set() };
        typeEntry.citation_count += 1;
        if (!responseTypes.has(source.source_type)) {
          typeEntry.response_count += 1;
          responseTypes.add(source.source_type);
        }
        typeEntry.domains.add(source.domain);
        typeMap.set(source.source_type, typeEntry);

        const domainEntry = domainMap.get(source.domain) || {
          domain: source.domain,
          source_type: source.source_type,
          citation_count: 0,
          response_count: 0,
          platforms: new Set(),
          categories: new Set(),
          owned: source.owned,
          competitor_owned: source.competitor_owned
        };
        domainEntry.citation_count += 1;
        if (!responseDomains.has(source.domain)) {
          domainEntry.response_count += 1;
          responseDomains.add(source.domain);
        }
        if (row.platform) domainEntry.platforms.add(row.platform);
        if (promptCategory) domainEntry.categories.add(promptCategory);
        domainMap.set(source.domain, domainEntry);

        if (source.url) {
          const urlEntry = urlMap.get(source.url) || {
            url: source.url,
            domain: source.domain,
            source_type: source.source_type,
            citation_count: 0,
            response_count: 0,
            platforms: new Set(),
            categories: new Set()
          };
          urlEntry.citation_count += 1;
          if (!responseUrls.has(source.url)) {
            urlEntry.response_count += 1;
            responseUrls.add(source.url);
          }
          if (row.platform) urlEntry.platforms.add(row.platform);
          if (promptCategory) urlEntry.categories.add(promptCategory);
          urlMap.set(source.url, urlEntry);
        }

        const record = {
          platform: row.platform || 'unknown',
          prompt_id: row.prompt_id || null,
          prompt_category: promptCategory,
          source_type: source.source_type,
          domain: source.domain,
          url: source.url,
          created_at: row.created_at || row.createdAt || null
        };
        records.push({ ...record, brand_mentioned: !!row.brand_mentioned });
        if (
          isActionablePrompt(record.prompt_id)
          && source.competitor_owned
          && (!row.brand_mentioned || !hasOwnedSource)
        ) {
          opportunities.push({ ...record, brand_mentioned: !!row.brand_mentioned });
        }
      }
    }

    if (!totalCitations) {
      return {
        ...this.empty(),
        source_changes: this.buildSourceChanges(changeRecords || [], context)
      };
    }

    const sortByCount = (a, b) => b.citation_count - a.citation_count || String(a.domain || a.type || a.url).localeCompare(String(b.domain || b.type || b.url));
    return {
      summary: {
        total_citations: totalCitations,
        cited_responses: citedResponses,
        owned_citations: ownedCitations,
        competitor_citations: competitorCitations,
        third_party_citations: thirdPartyCitations,
        source_domain_count: domainMap.size
      },
      source_types: Array.from(typeMap.values())
        .map((item) => ({
          type: item.type,
          citation_count: item.citation_count,
          response_count: item.response_count,
          domain_count: item.domains.size
        }))
        .sort(sortByCount),
      domains: Array.from(domainMap.values())
        .map((item) => ({
          ...item,
          platforms: Array.from(item.platforms),
          categories: Array.from(item.categories)
        }))
        .sort(sortByCount),
      urls: Array.from(urlMap.values())
        .map((item) => ({
          ...item,
          platforms: Array.from(item.platforms),
          categories: Array.from(item.categories)
        }))
        .sort(sortByCount),
      opportunities: opportunities.slice(0, 50),
      source_changes: this.buildSourceChanges(changeRecords || records, context),
      records: records.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).slice(0, 100)
    };
  }
}

module.exports = new SourceAnalysisService();

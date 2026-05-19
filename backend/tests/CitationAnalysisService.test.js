const test = require('node:test');
const assert = require('node:assert/strict');

const CitationAnalysisService = require('../services/CitationAnalysisService');

test('extracts unique citation sources from response text and metadata', () => {
  const result = CitationAnalysisService.extractSources({
    responseText: '参考 https://www.michelin.com.cn/tyres 和 https://example.com/a?x=1。',
    aiResponse: {
      citations: [
        { url: 'https://www.michelin.com.cn/tyres', title: '米其林轮胎' },
        { url: 'https://competitor.cn/article', title: '竞品文章' }
      ]
    },
    brand: { website: 'https://www.michelin.com.cn' },
    competitors: [{ website: 'https://competitor.cn' }]
  });

  assert.equal(result.sources.length, 3);
  assert.deepEqual(result.sources.map((item) => item.domain), [
    'michelin.com.cn',
    'example.com',
    'competitor.cn'
  ]);
  assert.equal(result.citation_count, 3);
  assert.equal(result.owned_citation_count, 1);
  assert.equal(result.competitor_citation_count, 1);
});

test('returns empty citation summary for responses without links', () => {
  const result = CitationAnalysisService.extractSources({
    responseText: '这是一段没有来源链接的回答。',
    aiResponse: {},
    brand: { website: 'https://brand.cn' },
    competitors: []
  });

  assert.deepEqual(result, {
    sources: [],
    citation_count: 0,
    owned_citation_count: 0,
    competitor_citation_count: 0
  });
});

test('does not treat technology names with dotted suffixes as citation urls', () => {
  const result = CitationAnalysisService.extractSources({
    responseText: '平台基于 Node.js、Vue.js 和 TypeScript 构建，适合前后端一体化开发。另见 https://node.js。',
    aiResponse: {
      citations: [
        { domain: 'node.js' }
      ]
    },
    brand: {},
    competitors: []
  });

  assert.deepEqual(result.sources, []);
  assert.equal(result.citation_count, 0);
});

test('matches owned and competitor domains regardless of leading www', () => {
  const result = CitationAnalysisService.extractSources({
    responseText: '参考 https://michelin.com.cn/tyres 和 https://www.competitor.cn/article',
    aiResponse: {},
    brand: { website: 'https://www.michelin.com.cn' },
    competitors: [{ website: 'https://competitor.cn' }]
  });

  assert.equal(result.owned_citation_count, 1);
  assert.equal(result.competitor_citation_count, 1);
});

test('extracts domain-only citation metadata when urls are unavailable', () => {
  const result = CitationAnalysisService.extractSources({
    responseText: '可以参考品牌官网和竞品资料。',
    aiResponse: {
      citations: [
        { domain: 'michelin.com.cn', title: '品牌官网' },
        { source_domain: 'competitor.cn', title: '竞品资料' },
        { hostname: 'competitor.cn', title: '重复竞品资料' }
      ]
    },
    brand: { website: 'https://www.michelin.com.cn' },
    competitors: [{ website: 'https://competitor.cn' }]
  });

  assert.deepEqual(result.sources, [
    { url: '', domain: 'michelin.com.cn', owned: true, competitor_owned: false },
    { url: '', domain: 'competitor.cn', owned: false, competitor_owned: true }
  ]);
  assert.equal(result.citation_count, 2);
  assert.equal(result.owned_citation_count, 1);
  assert.equal(result.competitor_citation_count, 1);
});

test('ignores non-domain citation metadata values', () => {
  const result = CitationAnalysisService.extractSources({
    responseText: '',
    aiResponse: {
      citations: [
        { domain: '品牌官网' },
        { source_domain: '来源：竞品资料' },
        { hostname: 'competitor.cn' }
      ]
    },
    brand: { website: 'https://brand.cn' },
    competitors: [{ website: 'https://competitor.cn' }]
  });

  assert.deepEqual(result.sources, [
    { url: '', domain: 'competitor.cn', owned: false, competitor_owned: true }
  ]);
  assert.equal(result.citation_count, 1);
});

test('extracts bare citation urls from structured metadata fields', () => {
  const result = CitationAnalysisService.extractSources({
    responseText: '',
    aiResponse: {
      citations: [
        { url: 'www.michelin.com.cn/tyres' },
        { link: 'competitor.cn/article?id=2' }
      ]
    },
    brand: { website: 'https://michelin.com.cn' },
    competitors: [{ website: 'https://competitor.cn' }]
  });

  assert.deepEqual(result.sources.map((item) => item.url), [
    'https://michelin.com.cn/tyres',
    'https://competitor.cn/article?id=2'
  ]);
  assert.equal(result.owned_citation_count, 1);
  assert.equal(result.competitor_citation_count, 1);
});

test('extracts bare citation urls after Chinese and ASCII source colons', () => {
  const result = CitationAnalysisService.extractSources({
    responseText: '来源：brand.cn/guide\n参考: competitor.cn/article',
    aiResponse: {},
    brand: { website: 'https://brand.cn' },
    competitors: [{ website: 'https://competitor.cn' }]
  });

  assert.deepEqual(result.sources.map((item) => item.url), [
    'https://brand.cn/guide',
    'https://competitor.cn/article'
  ]);
  assert.equal(result.owned_citation_count, 1);
  assert.equal(result.competitor_citation_count, 1);
});

test('extracts citation urls from common web-search metadata fields', () => {
  const result = CitationAnalysisService.extractSources({
    responseText: '',
    aiResponse: {
      source_urls: ['https://brand.cn/a?utm_source=ai'],
      sourceUrls: ['https://competitor.cn/b?gclid=abc'],
      web_search: [{ link: 'media.cn/report' }],
      webSearch: [{ source_domain: 'zhihu.com' }]
    },
    brand: { website: 'https://brand.cn' },
    competitors: [{ website: 'https://competitor.cn' }]
  });

  assert.deepEqual(result.sources, [
    { url: 'https://brand.cn/a', domain: 'brand.cn', owned: true, competitor_owned: false },
    { url: 'https://competitor.cn/b', domain: 'competitor.cn', owned: false, competitor_owned: true },
    { url: 'https://media.cn/report', domain: 'media.cn', owned: false, competitor_owned: false },
    { url: '', domain: 'zhihu.com', owned: false, competitor_owned: false }
  ]);
  assert.equal(result.citation_count, 4);
});

test('extracts citation urls from common source and reference metadata fields', () => {
  const result = CitationAnalysisService.extractSources({
    responseText: '',
    aiResponse: {
      citations: [
        { source: 'brand.cn/guide?utm_source=ai' },
        { reference_url: 'https://competitor.cn/report?gclid=abc' },
        { display_url: 'media.cn/article' }
      ]
    },
    brand: { website: 'https://brand.cn' },
    competitors: [{ website: 'https://competitor.cn' }]
  });

  assert.deepEqual(result.sources, [
    { url: 'https://brand.cn/guide', domain: 'brand.cn', owned: true, competitor_owned: false },
    { url: 'https://competitor.cn/report', domain: 'competitor.cn', owned: false, competitor_owned: true },
    { url: 'https://media.cn/article', domain: 'media.cn', owned: false, competitor_owned: false }
  ]);
});

test('extracts citation urls embedded inside metadata string fields', () => {
  const result = CitationAnalysisService.extractSources({
    responseText: '',
    aiResponse: {
      citations: [
        { source: '品牌官网：https://brand.cn/guide?utm_source=ai' },
        { reference_url: '竞品资料 competitor.cn/report?gclid=abc' },
        { content: '第三方评测见 https://media.cn/article。' }
      ]
    },
    brand: { website: 'https://brand.cn' },
    competitors: [{ website: 'https://competitor.cn' }]
  });

  assert.deepEqual(result.sources, [
    { url: 'https://brand.cn/guide', domain: 'brand.cn', owned: true, competitor_owned: false },
    { url: 'https://competitor.cn/report', domain: 'competitor.cn', owned: false, competitor_owned: true },
    { url: 'https://media.cn/article', domain: 'media.cn', owned: false, competitor_owned: false }
  ]);
});

test('extracts citation urls from annotation metadata fields', () => {
  const result = CitationAnalysisService.extractSources({
    responseText: '',
    aiResponse: {
      choices: [
        {
          message: {
            annotations: [
              {
                type: 'url_citation',
                url_citation: {
                  url: 'https://brand.cn/article?utm_campaign=ai',
                  title: '品牌资料'
                }
              }
            ]
          }
        }
      ]
    },
    brand: { website: 'https://brand.cn' },
    competitors: []
  });

  assert.deepEqual(result.sources, [
    {
      url: 'https://brand.cn/article',
      domain: 'brand.cn',
      title: '品牌资料',
      source_origin: 'web_search',
      owned: true,
      competitor_owned: false
    }
  ]);
  assert.equal(result.citation_count, 1);
  assert.equal(result.owned_citation_count, 1);
});

test('extracts citation urls from response output content annotations', () => {
  const result = CitationAnalysisService.extractSources({
    responseText: '',
    aiResponse: {
      output: [
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: '参考品牌资料',
              annotations: [
                {
                  type: 'url_citation',
                  url_citation: {
                    url: 'https://brand.cn/report?utm_source=ai'
                  }
                }
              ]
            }
          ]
        }
      ]
    },
    brand: { website: 'https://brand.cn' },
    competitors: []
  });

  assert.deepEqual(result.sources, [
    {
      url: 'https://brand.cn/report',
      domain: 'brand.cn',
      source_origin: 'web_search',
      owned: true,
      competitor_owned: false
    }
  ]);
  assert.equal(result.owned_citation_count, 1);
});

test('marks Ark web search url citations with origin metadata', () => {
  const result = CitationAnalysisService.extractSources({
    responseText: '',
    aiResponse: {
      output: [
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: '参考品牌资料',
              annotations: [
                {
                  type: 'url_citation',
                  url_citation: {
                    url: 'https://brand.cn/report?utm_source=ai',
                    title: '品牌资料'
                  }
                }
              ]
            }
          ]
        }
      ]
    },
    brand: { website: 'https://brand.cn' },
    competitors: []
  });

  assert.deepEqual(result.sources, [
    {
      url: 'https://brand.cn/report',
      domain: 'brand.cn',
      title: '品牌资料',
      source_origin: 'web_search',
      owned: true,
      competitor_owned: false
    }
  ]);
});

test('does not double count metadata domain fields when a citation url is present', () => {
  const result = CitationAnalysisService.extractSources({
    responseText: '',
    aiResponse: {
      citations: [
        {
          url: 'https://www.michelin.com.cn/tyres?utm_source=ai',
          domain: 'michelin.com.cn',
          source_domain: 'www.michelin.com.cn',
          title: '品牌官网'
        }
      ]
    },
    brand: { website: 'https://www.michelin.com.cn' },
    competitors: []
  });

  assert.deepEqual(result.sources, [
    {
      url: 'https://michelin.com.cn/tyres',
      domain: 'michelin.com.cn',
      owned: true,
      competitor_owned: false
    }
  ]);
  assert.equal(result.citation_count, 1);
  assert.equal(result.owned_citation_count, 1);
});

test('does not double count domain-only metadata when the same response already has a URL for that domain', () => {
  const result = CitationAnalysisService.extractSources({
    responseText: '参考 https://www.michelin.com.cn/tyres 和 https://competitor.cn/article',
    aiResponse: {
      citations: [
        { domain: 'michelin.com.cn', title: '品牌官网' },
        { source_domain: 'www.competitor.cn', title: '竞品资料' },
        { domain: 'thirdparty.cn', title: '第三方资料' }
      ]
    },
    brand: { website: 'https://www.michelin.com.cn' },
    competitors: [{ website: 'https://competitor.cn' }]
  });

  assert.deepEqual(result.sources.map((item) => item.domain), [
    'michelin.com.cn',
    'competitor.cn',
    'thirdparty.cn'
  ]);
  assert.equal(result.citation_count, 3);
  assert.equal(result.owned_citation_count, 1);
  assert.equal(result.competitor_citation_count, 1);
});

test('preserves meaningful URL query parameters and removes tracking parameters', () => {
  const result = CitationAnalysisService.extractSources({
    responseText: [
      '参考 https://example.com/article?id=1&utm_source=ai',
      'https://example.com/article?utm_medium=chat&id=1',
      'https://example.com/article?id=2',
      'https://example.com/article?utm_campaign=x'
    ].join(' '),
    aiResponse: {},
    brand: {},
    competitors: []
  });

  assert.deepEqual(result.sources.map((item) => item.url), [
    'https://example.com/article?id=1',
    'https://example.com/article?id=2',
    'https://example.com/article'
  ]);
  assert.equal(result.citation_count, 3);
});

test('removes common ad and share tracking parameters from citation urls', () => {
  const result = CitationAnalysisService.extractSources({
    responseText: [
      '参考 https://example.com/article?id=1&gclid=abc',
      'https://example.com/article?fbclid=def&id=1',
      'https://example.com/article?id=1&bd_vid=123',
      'https://example.com/article?id=1&share_source=wechat'
    ].join(' '),
    aiResponse: {},
    brand: {},
    competitors: []
  });

  assert.deepEqual(result.sources.map((item) => item.url), [
    'https://example.com/article?id=1'
  ]);
  assert.equal(result.citation_count, 1);
});

test('deduplicates citation urls across leading www variants before metrics are stored', () => {
  const result = CitationAnalysisService.extractSources({
    responseText: [
      '参考 https://www.example.com/article?id=1&utm_source=ai',
      'https://example.com/article/?id=1'
    ].join(' '),
    aiResponse: {},
    brand: {},
    competitors: []
  });

  assert.deepEqual(result.sources, [
    {
      url: 'https://example.com/article?id=1',
      domain: 'example.com',
      owned: false,
      competitor_owned: false
    }
  ]);
  assert.equal(result.citation_count, 1);
});

test('strips common trailing sentence punctuation from extracted URLs', () => {
  const result = CitationAnalysisService.extractSources({
    responseText: '参考 https://example.com/article?id=1. 也可以看 https://example.com/list, 以及 https://example.com/help!',
    aiResponse: {},
    brand: {},
    competitors: []
  });

  assert.deepEqual(result.sources.map((item) => item.url), [
    'https://example.com/article?id=1',
    'https://example.com/list',
    'https://example.com/help'
  ]);
});

test('strips Chinese closing quotes and book-title marks from extracted URLs', () => {
  const result = CitationAnalysisService.extractSources({
    responseText: '参考“https://example.com/article?id=1”，以及《https://competitor.cn/report》。另见：https://brand.cn/help”',
    aiResponse: {},
    brand: { website: 'https://brand.cn' },
    competitors: [{ website: 'https://competitor.cn' }]
  });

  assert.deepEqual(result.sources.map((item) => item.url), [
    'https://example.com/article?id=1',
    'https://competitor.cn/report',
    'https://brand.cn/help'
  ]);
  assert.equal(result.owned_citation_count, 1);
  assert.equal(result.competitor_citation_count, 1);
});

test('extracts bare citation urls from AI response text', () => {
  const result = CitationAnalysisService.extractSources({
    responseText: '参考 www.michelin.com.cn/tyres 和 competitor.cn/article?id=2，以及 zhihu.com/question/1。',
    aiResponse: {},
    brand: { website: 'https://michelin.com.cn' },
    competitors: [{ website: 'https://competitor.cn' }]
  });

  assert.deepEqual(result.sources.map((item) => item.url), [
    'https://michelin.com.cn/tyres',
    'https://competitor.cn/article?id=2',
    'https://zhihu.com/question/1'
  ]);
  assert.equal(result.owned_citation_count, 1);
  assert.equal(result.competitor_citation_count, 1);
});

test('extracts punycode citation domains from AI response text', () => {
  const result = CitationAnalysisService.extractSources({
    responseText: '参考 xn--fiqs8s.cn/report 和 https://www.xn--fiqs8s.cn/help。',
    aiResponse: {},
    brand: {},
    competitors: []
  });

  assert.deepEqual(result.sources.map((item) => item.url), [
    'https://xn--fiqs8s.cn/report',
    'https://xn--fiqs8s.cn/help'
  ]);
});

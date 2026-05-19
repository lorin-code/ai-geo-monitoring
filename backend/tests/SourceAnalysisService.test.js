const test = require('node:test');
const assert = require('node:assert/strict');

const SourceAnalysisService = require('../services/SourceAnalysisService');

test('summarizes citation sources by owner, domain, url and opportunity rows', () => {
  const result = SourceAnalysisService.summarize([
    {
      platform: 'deepseek',
      prompt_id: 1,
      prompt_category: '购买决策',
      brand_mentioned: true,
      citation_sources: [
        { url: 'https://brand.example.com/buy', domain: 'brand.example.com', owned: true },
        { url: 'https://news.example.com/review', domain: 'news.example.com' }
      ],
      created_at: '2026-05-01T00:00:00.000Z'
    },
    {
      platform: 'doubao',
      prompt_id: 2,
      prompt_category: '竞品对比',
      brand_mentioned: false,
      citation_sources: [
        { url: 'https://competitor.cn/page', domain: 'competitor.cn', competitor_owned: true },
        { url: 'https://www.zhihu.com/question/123', domain: 'www.zhihu.com' },
        { url: 'https://item.jd.com/123.html', domain: 'item.jd.com' }
      ],
      created_at: '2026-05-02T00:00:00.000Z'
    }
  ], {
    brand: { website: 'https://brand.example.com' },
    competitors: [{ name: '竞品 A', website: 'https://competitor.cn' }]
  });

  assert.equal(result.summary.total_citations, 5);
  assert.equal(result.summary.cited_responses, 2);
  assert.equal(result.summary.owned_citations, 1);
  assert.equal(result.summary.competitor_citations, 1);
  assert.equal(result.summary.third_party_citations, 3);
  assert.equal(result.source_types.some((item) => item.type === '自有来源' && item.citation_count === 1), true);
  assert.equal(result.source_types.some((item) => item.type === '竞品来源' && item.citation_count === 1), true);
  assert.equal(result.source_types.some((item) => item.type === '社区问答' && item.citation_count === 1), true);
  assert.equal(result.source_types.some((item) => item.type === '电商平台' && item.citation_count === 1), true);
  assert.equal(result.domains[0].domain, 'brand.example.com');
  assert.equal(result.urls.length, 5);
  assert.deepEqual(result.opportunities, [
    {
      platform: 'doubao',
      prompt_id: 2,
      prompt_category: '竞品对比',
      source_type: '竞品来源',
      domain: 'competitor.cn',
      url: 'https://competitor.cn/page',
      created_at: '2026-05-02T00:00:00.000Z',
      brand_mentioned: false
    }
  ]);
});

test('detects new and dropped citation domains between source periods', () => {
  const result = SourceAnalysisService.summarize([
    {
      platform: 'deepseek',
      prompt_category: '购买决策',
      brand_mentioned: true,
      citation_sources: [
        { url: 'https://old.example.com/a', domain: 'old.example.com' },
        { url: 'https://kept.example.com/a', domain: 'kept.example.com' }
      ],
      created_at: '2026-05-04T00:00:00.000Z'
    },
    {
      platform: 'doubao',
      prompt_category: '竞品对比',
      brand_mentioned: true,
      citation_sources: [
        { url: 'https://new.example.com/a', domain: 'new.example.com' },
        { url: 'https://kept.example.com/a', domain: 'kept.example.com' },
        { url: 'https://kept.example.com/b', domain: 'kept.example.com' }
      ],
      created_at: '2026-05-10T00:00:00.000Z'
    }
  ], {
    days: 7,
    referenceDate: '2026-05-15T00:00:00.000Z'
  });

  assert.deepEqual(result.source_changes.new_domains.map((item) => item.domain), ['new.example.com']);
  assert.deepEqual(result.source_changes.dropped_domains.map((item) => item.domain), ['old.example.com']);
  assert.deepEqual(result.source_changes.retained_domains.map((item) => item.domain), ['kept.example.com']);
  assert.deepEqual(result.source_changes.new_urls.map((item) => item.url), [
    'https://kept.example.com/b',
    'https://new.example.com/a'
  ]);
  assert.deepEqual(result.source_changes.retained_urls.map((item) => item.url), [
    'https://kept.example.com/a'
  ]);
});

test('uses wider change metrics without expanding current source summary', () => {
  const currentMetric = {
    platform: 'doubao',
    prompt_category: '竞品对比',
    brand_mentioned: true,
    citation_sources: [
      { url: 'https://new.example.com/a', domain: 'new.example.com' }
    ],
    created_at: '2026-05-10T00:00:00.000Z'
  };
  const previousMetric = {
    platform: 'deepseek',
    prompt_category: '购买决策',
    brand_mentioned: true,
    citation_sources: [
      { url: 'https://old.example.com/a', domain: 'old.example.com' }
    ],
    created_at: '2026-05-04T00:00:00.000Z'
  };

  const result = SourceAnalysisService.summarize([currentMetric], {
    days: 7,
    referenceDate: '2026-05-15T00:00:00.000Z',
    changeMetrics: [previousMetric, currentMetric]
  });

  assert.equal(result.summary.total_citations, 1);
  assert.deepEqual(result.domains.map((item) => item.domain), ['new.example.com']);
  assert.deepEqual(result.source_changes.new_domains.map((item) => item.domain), ['new.example.com']);
  assert.deepEqual(result.source_changes.dropped_domains.map((item) => item.domain), ['old.example.com']);
});

test('sorts changed citation urls deterministically within the same domain', () => {
  const result = SourceAnalysisService.summarize([
    {
      platform: 'doubao',
      prompt_category: '购买决策',
      brand_mentioned: true,
      citation_sources: [
        { url: 'https://example.com/b', domain: 'example.com' },
        { url: 'https://example.com/a', domain: 'example.com' }
      ],
      created_at: '2026-05-10T00:00:00.000Z'
    }
  ], {
    days: 7,
    referenceDate: '2026-05-15T00:00:00.000Z'
  });

  assert.deepEqual(result.source_changes.new_urls.map((item) => item.url), [
    'https://example.com/a',
    'https://example.com/b'
  ]);
});

test('uses calendar-day boundaries for source period comparisons', () => {
  const changes = SourceAnalysisService.buildSourceChanges([
    {
      domain: 'current.example.com',
      url: 'https://current.example.com/a',
      source_type: '第三方来源',
      created_at: '2026-05-11T01:00:00.000+08:00'
    },
    {
      domain: 'previous.example.com',
      url: 'https://previous.example.com/a',
      source_type: '第三方来源',
      created_at: '2026-05-10T23:00:00.000+08:00'
    }
  ], {
    days: 7,
    referenceDate: '2026-05-17T15:30:00.000+08:00'
  });

  assert.deepEqual(changes.new_domains.map((item) => item.domain), ['current.example.com']);
  assert.deepEqual(changes.dropped_domains.map((item) => item.domain), ['previous.example.com']);
});

test('falls back to a safe source comparison window for invalid days', () => {
  const changes = SourceAnalysisService.buildSourceChanges([
    {
      domain: 'example.com',
      url: 'https://example.com/a',
      source_type: '第三方来源',
      created_at: '2026-05-10T00:00:00.000Z'
    }
  ], {
    days: 'abc',
    referenceDate: '2026-05-15T00:00:00.000Z'
  });

  assert.deepEqual(changes.new_domains.map((item) => item.domain), ['example.com']);
});

test('counts source response coverage once per AI answer', () => {
  const result = SourceAnalysisService.summarize([
    {
      platform: 'deepseek',
      prompt_category: '购买决策',
      brand_mentioned: true,
      citation_sources: [
        { url: 'https://example.com/a', domain: 'example.com' },
        { url: 'https://example.com/b', domain: 'example.com' },
        { url: 'https://www.zhihu.com/question/1', domain: 'www.zhihu.com' },
        { url: 'https://www.zhihu.com/question/2', domain: 'www.zhihu.com' }
      ],
      created_at: '2026-05-01T00:00:00.000Z'
    }
  ]);

  const domain = result.domains.find((item) => item.domain === 'example.com');
  const sourceType = result.source_types.find((item) => item.type === '社区问答');

  assert.equal(domain.citation_count, 2);
  assert.equal(domain.response_count, 1);
  assert.equal(sourceType.citation_count, 2);
  assert.equal(sourceType.response_count, 1);
});

test('normalizes stored metric categories in source analytics', () => {
  const result = SourceAnalysisService.summarize([
    {
      platform: 'deepseek',
      prompt_id: 1,
      prompt_category: '历史脏分类',
      question: '马牌和米其林哪个好',
      brand_mentioned: true,
      citation_sources: [
        { url: 'https://example.com/a', domain: 'example.com' }
      ],
      created_at: '2026-05-01T00:00:00.000Z'
    }
  ]);

  assert.deepEqual(result.domains[0].categories, ['竞品对比']);
  assert.deepEqual(result.urls[0].categories, ['竞品对比']);
  assert.equal(result.records[0].prompt_category, '竞品对比');
});

test('uses current prompt catalog category before stale stored metric category in source analytics', () => {
  const result = SourceAnalysisService.summarize([
    {
      platform: 'deepseek',
      prompt_id: 1,
      prompt_category: '购买决策',
      brand_mentioned: true,
      citation_sources: [
        { url: 'https://example.com/a', domain: 'example.com' }
      ],
      created_at: '2026-05-01T00:00:00.000Z'
    }
  ], {
    prompts: [
      { id: 1, question: '马牌和米其林哪个好', tags: ['竞品对比'] }
    ]
  });

  assert.deepEqual(result.domains[0].categories, ['竞品对比']);
  assert.deepEqual(result.urls[0].categories, ['竞品对比']);
  assert.equal(result.records[0].prompt_category, '竞品对比');
});

test('classifies common mainland content citation domains as media sources', () => {
  const result = SourceAnalysisService.summarize([
    {
      platform: 'deepseek',
      prompt_category: '购买决策',
      brand_mentioned: true,
      citation_sources: [
        { url: 'https://baijiahao.baidu.com/s?id=1', domain: 'baijiahao.baidu.com' },
        { url: 'https://mp.weixin.qq.com/s/demo', domain: 'mp.weixin.qq.com' },
        { url: 'https://www.toutiao.com/article/1', domain: 'www.toutiao.com' },
        { url: 'https://www.thepaper.cn/newsDetail_forward_1', domain: 'www.thepaper.cn' }
      ],
      created_at: '2026-05-01T00:00:00.000Z'
    }
  ]);

  assert.equal(result.summary.total_citations, 4);
  assert.deepEqual(result.source_types.map((item) => ({
    type: item.type,
    citation_count: item.citation_count,
    domain_count: item.domain_count
  })), [
    { type: '媒体内容', citation_count: 4, domain_count: 4 }
  ]);
});

test('aggregates leading-www and bare domains as the same citation domain', () => {
  const result = SourceAnalysisService.summarize([
    {
      platform: 'deepseek',
      prompt_category: '购买决策',
      brand_mentioned: true,
      citation_sources: [
        { url: 'https://www.example.com/a', domain: 'www.example.com' },
        { url: 'https://example.com/b', domain: 'example.com' }
      ],
      created_at: '2026-05-01T00:00:00.000Z'
    }
  ]);

  assert.equal(result.summary.source_domain_count, 1);
  assert.deepEqual(result.domains.map((item) => ({
    domain: item.domain,
    citation_count: item.citation_count,
    response_count: item.response_count
  })), [
    { domain: 'example.com', citation_count: 2, response_count: 1 }
  ]);
});

test('uses citation url domain before stale source domain metadata', () => {
  const result = SourceAnalysisService.summarize([
    {
      platform: 'deepseek',
      prompt_category: '购买决策',
      brand_mentioned: true,
      citation_sources: [
        { url: 'https://brand.example.com/a', domain: 'competitor.cn', competitor_owned: true }
      ],
      created_at: '2026-05-01T00:00:00.000Z'
    }
  ], {
    brand: { website: 'https://brand.example.com' },
    competitors: [{ website: 'https://competitor.cn' }]
  });

  assert.deepEqual(result.domains.map((item) => ({
    domain: item.domain,
    owned: item.owned,
    competitor_owned: item.competitor_owned
  })), [
    { domain: 'brand.example.com', owned: true, competitor_owned: false }
  ]);
  assert.equal(result.summary.owned_citations, 1);
  assert.equal(result.summary.competitor_citations, 0);
});

test('normalizes citation urls before grouping source url analytics', () => {
  const result = SourceAnalysisService.summarize([
    {
      platform: 'deepseek',
      prompt_category: '购买决策',
      brand_mentioned: true,
      citation_sources: [
        { url: 'https://example.com/a?id=1&utm_source=doubao', domain: 'example.com' }
      ],
      created_at: '2026-05-01T00:00:00.000Z'
    },
    {
      platform: 'doubao',
      prompt_category: '购买决策',
      brand_mentioned: true,
      citation_sources: [
        { url: 'https://www.example.com/a/?utm_campaign=test&id=1', domain: 'www.example.com' }
      ],
      created_at: '2026-05-02T00:00:00.000Z'
    }
  ]);

  assert.equal(result.urls.length, 1);
  assert.deepEqual(result.urls.map((item) => ({
    url: item.url,
    domain: item.domain,
    citation_count: item.citation_count,
    response_count: item.response_count,
    platforms: item.platforms
  })), [
    {
      url: 'https://example.com/a?id=1',
      domain: 'example.com',
      citation_count: 2,
      response_count: 2,
      platforms: ['deepseek', 'doubao']
    }
  ]);
});

test('normalizes bare citation urls before grouping source url analytics', () => {
  const result = SourceAnalysisService.summarize([
    {
      platform: 'deepseek',
      prompt_category: '购买决策',
      brand_mentioned: true,
      citation_sources: [
        { url: 'www.example.com/a?id=1&utm_source=doubao', domain: 'www.example.com' }
      ],
      created_at: '2026-05-01T00:00:00.000Z'
    },
    {
      platform: 'doubao',
      prompt_category: '购买决策',
      brand_mentioned: true,
      citation_sources: [
        { url: 'https://example.com/a/?utm_campaign=test&id=1', domain: 'example.com' }
      ],
      created_at: '2026-05-02T00:00:00.000Z'
    }
  ]);

  assert.deepEqual(result.urls.map((item) => ({
    url: item.url,
    citation_count: item.citation_count,
    response_count: item.response_count
  })), [
    {
      url: 'https://example.com/a?id=1',
      citation_count: 2,
      response_count: 2
    }
  ]);
});

test('keeps root citation urls in the same canonical format as citation extraction', () => {
  const result = SourceAnalysisService.summarize([
    {
      platform: 'deepseek',
      prompt_category: '购买决策',
      brand_mentioned: true,
      citation_sources: [
        { url: 'https://www.example.com/', domain: 'www.example.com' },
        { url: 'https://example.com?utm_source=doubao', domain: 'example.com' }
      ],
      created_at: '2026-05-01T00:00:00.000Z'
    }
  ]);

  assert.deepEqual(result.urls.map((item) => ({
    url: item.url,
    citation_count: item.citation_count,
    response_count: item.response_count
  })), [
    {
      url: 'https://example.com',
      citation_count: 1,
      response_count: 1
    }
  ]);
});

test('deduplicates repeated normalized citation urls within one AI answer', () => {
  const result = SourceAnalysisService.summarize([
    {
      platform: 'deepseek',
      prompt_category: '购买决策',
      brand_mentioned: true,
      citation_sources: [
        { url: 'https://www.example.com/a/?utm_source=doubao&id=1', domain: 'www.example.com' },
        { url: 'https://example.com/a?id=1', domain: 'example.com' },
        { url: 'https://example.com/a/?id=1&utm_campaign=test', domain: 'example.com' }
      ],
      created_at: '2026-05-01T00:00:00.000Z'
    }
  ]);

  assert.equal(result.summary.total_citations, 1);
  assert.equal(result.summary.source_domain_count, 1);
  assert.deepEqual(result.urls.map((item) => ({
    url: item.url,
    citation_count: item.citation_count,
    response_count: item.response_count
  })), [
    {
      url: 'https://example.com/a?id=1',
      citation_count: 1,
      response_count: 1
    }
  ]);
});

test('counts domain-only citation sources when source urls are unavailable', () => {
  const result = SourceAnalysisService.summarize([
    {
      platform: 'deepseek',
      prompt_id: 7,
      prompt_category: '竞品对比',
      brand_mentioned: false,
      citation_sources: [
        { domain: 'brand.example.com', owned: true },
        { domain: 'competitor.cn', competitor_owned: true }
      ],
      created_at: '2026-05-01T00:00:00.000Z'
    }
  ], {
    brand: { website: 'https://brand.example.com' },
    competitors: [{ name: '竞品 A', website: 'https://competitor.cn' }]
  });

  assert.equal(result.summary.total_citations, 2);
  assert.equal(result.summary.source_domain_count, 2);
  assert.equal(result.urls.length, 0);
  assert.deepEqual(result.opportunities, [
    {
      platform: 'deepseek',
      prompt_id: 7,
      prompt_category: '竞品对比',
      source_type: '竞品来源',
      domain: 'competitor.cn',
      url: '',
      created_at: '2026-05-01T00:00:00.000Z',
      brand_mentioned: false
    }
  ]);
});

test('ignores invalid stored domain-only citation sources', () => {
  const result = SourceAnalysisService.summarize([
    {
      platform: 'deepseek',
      prompt_category: '购买决策',
      brand_mentioned: true,
      citation_sources: [
        { url: '', domain: '品牌官网' },
        { url: '', domain: '来源：竞品资料' },
        { url: '', domain: 'example.com' }
      ],
      created_at: '2026-05-01T00:00:00.000Z'
    }
  ]);

  assert.equal(result.summary.total_citations, 1);
  assert.deepEqual(result.domains.map((item) => item.domain), ['example.com']);
});

test('ignores stored citation urls whose domain is a technology suffix', () => {
  const result = SourceAnalysisService.summarize([
    {
      id: 1,
      question_record_id: 10,
      platform: 'doubao',
      created_at: '2026-05-19T12:00:00Z',
      citation_sources: [
        { url: 'https://node.js', domain: 'node.js' },
        { url: 'https://example.com/a', domain: 'example.com' }
      ]
    }
  ]);

  assert.equal(result.summary.total_citations, 1);
  assert.deepEqual(result.urls.map((item) => item.url), ['https://example.com/a']);
  assert.deepEqual(result.domains.map((item) => item.domain), ['example.com']);
});

test('deduplicates domain-only citation sources when the same answer already has a URL for that domain', () => {
  const result = SourceAnalysisService.summarize([
    {
      platform: 'deepseek',
      prompt_category: '购买决策',
      brand_mentioned: true,
      citation_sources: [
        { url: 'https://www.example.com/a', domain: 'www.example.com' },
        { domain: 'example.com' },
        { domain: 'www.example.com' },
        { domain: 'other.example.com' }
      ],
      created_at: '2026-05-01T00:00:00.000Z'
    }
  ]);

  assert.equal(result.summary.total_citations, 2);
  assert.deepEqual(result.domains.map((item) => ({
    domain: item.domain,
    citation_count: item.citation_count,
    response_count: item.response_count
  })), [
    { domain: 'example.com', citation_count: 1, response_count: 1 },
    { domain: 'other.example.com', citation_count: 1, response_count: 1 }
  ]);
});

test('surfaces competitor source opportunities when brand is mentioned but no owned source is cited', () => {
  const result = SourceAnalysisService.summarize([
    {
      platform: 'doubao',
      prompt_id: 8,
      prompt_category: '竞品对比',
      brand_mentioned: true,
      citation_sources: [
        { url: 'https://competitor.cn/page', domain: 'competitor.cn', competitor_owned: true },
        { url: 'https://media.example.com/review', domain: 'media.example.com' }
      ],
      created_at: '2026-05-01T00:00:00.000Z'
    }
  ], {
    brand: { website: 'https://brand.example.com' },
    competitors: [{ name: '竞品 A', website: 'https://competitor.cn' }]
  });

  assert.deepEqual(result.opportunities, [
    {
      platform: 'doubao',
      prompt_id: 8,
      prompt_category: '竞品对比',
      source_type: '竞品来源',
      domain: 'competitor.cn',
      url: 'https://competitor.cn/page',
      created_at: '2026-05-01T00:00:00.000Z',
      brand_mentioned: true
    }
  ]);
});

test('does not surface source opportunities for disabled prompts', () => {
  const result = SourceAnalysisService.summarize([
    {
      platform: 'deepseek',
      prompt_id: 1,
      prompt_category: '竞品对比',
      brand_mentioned: true,
      citation_sources: [
        { url: 'https://competitor.cn/page', domain: 'competitor.cn' }
      ],
      created_at: '2026-05-02T00:00:00.000Z'
    }
  ], {
    brand: { website: 'https://brand.cn' },
    competitors: [{ name: '竞品', website: 'https://competitor.cn' }],
    prompts: [{ id: 1, enabled: false }]
  });

  assert.equal(result.summary.total_citations, 1);
  assert.deepEqual(result.opportunities, []);
});

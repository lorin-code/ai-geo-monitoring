const test = require('node:test');
const assert = require('node:assert/strict');

const DeepSeekSearchService = require('../services/DeepSeekSearchService');
const CitationAnalysisService = require('../services/CitationAnalysisService');

const results = [
  { id: 1, title: '品牌资料', url: 'https://brand.cn/guide', summary: '产品参数' },
  { id: 2, title: '竞品资料', url: 'https://competitor.cn/review', summary: '对比资料' },
  { id: 3, title: '未引用资料', url: 'https://unused.cn/news', summary: '其他新闻' }
];

test('limits search fields by Unicode characters while keeping the original model question', () => {
  const question = `  最新轮胎\n 推荐 ${'🚗'.repeat(130)}  `;
  const request = DeepSeekSearchService.buildSearchRequest(question);
  const messages = DeepSeekSearchService.buildMessages(question, results);

  assert.equal(Array.from(request.query).length, 128);
  assert.equal(request.query.startsWith('最新轮胎 推荐 '), true);
  assert.equal(request.query.endsWith('🚗'), true);
  assert.equal(request.ori_question, request.query);
  assert.equal(request.need_content, false);
  assert.deepEqual(messages.at(-1), { role: 'user', content: question });
  assert.equal(messages[0].role, 'system');
  assert.equal(messages[1].role, 'user');
  assert.deepEqual(JSON.parse(messages[1].content.slice(messages[1].content.indexOf('\n') + 1)), results);
});

test('validates empty search queries and falls back from invalid result counts', (context) => {
  const original = process.env.DEEPSEEK_SEARCH_COUNT;
  context.after(() => restoreEnv('DEEPSEEK_SEARCH_COUNT', original));
  process.env.DEEPSEEK_SEARCH_COUNT = '51';
  assert.throws(() => DeepSeekSearchService.buildSearchRequest(' \n '), /搜索词/);
  assert.equal(DeepSeekSearchService.buildSearchRequest('轮胎推荐').count, 10);
  process.env.DEEPSEEK_SEARCH_COUNT = '5';
  assert.equal(DeepSeekSearchService.buildSearchRequest('轮胎推荐').count, 5);
  process.env.DEEPSEEK_SEARCH_COUNT = '1.5';
  assert.equal(DeepSeekSearchService.buildSearchRequest('轮胎推荐').count, 10);
});

test('derives search endpoints for official and gateway chat URLs with an explicit override', (context) => {
  const original = process.env.DEEPSEEK_SEARCH_API_URL;
  context.after(() => restoreEnv('DEEPSEEK_SEARCH_API_URL', original));
  process.env.DEEPSEEK_SEARCH_API_URL = '';
  assert.equal(DeepSeekSearchService.getApiUrl('https://api.deepseek.com/v1/chat/completions'), 'https://api.deepseek.com/v1/tools/search');
  assert.equal(DeepSeekSearchService.getApiUrl('https://api.deepseek.com/chat/completions'), 'https://api.deepseek.com/v1/tools/search');
  assert.equal(DeepSeekSearchService.getApiUrl('https://gateway.example/deepseek/v1/chat/completions'), 'https://gateway.example/deepseek/v1/tools/search');
  process.env.DEEPSEEK_SEARCH_API_URL = ' https://gateway.example/search ';
  assert.equal(DeepSeekSearchService.getApiUrl('https://api.deepseek.com/v1/chat/completions'), 'https://gateway.example/search');
});

test('normalizes official result fields, bounds context and rejects unsafe source URLs', () => {
  const normalized = DeepSeekSearchService.normalizeResults({ results: [
    { title: ' 品牌资料 ', url: 'https://brand.cn/guide', summary: '参数'.repeat(3000), content: '不会注入完整正文', rerank_score: 2.4, authority: 3 },
    { title: '无效链接', url: 'javascript:alert(1)', summary: '不能引用' },
    { title: '凭证链接', url: 'https://user:password@private.cn/guide' },
    { title: '重复', url: 'https://brand.cn/guide?utm_source=ai' },
    { title: '', url: 'https://media.cn/review', snippet: '短摘要' }
  ] });

  assert.equal(normalized.length, 2);
  assert.equal(normalized[0].id, 1);
  assert.equal(normalized[0].title, '品牌资料');
  assert.equal(Array.from(normalized[0].summary).length, 2000);
  assert.deepEqual(normalized[1], { id: 2, title: 'media.cn', url: 'https://media.cn/review', summary: '短摘要' });
  assert.equal(JSON.stringify(normalized).includes('不会注入完整正文'), false);
});

test('accepts empty search results but rejects malformed provider payloads', () => {
  assert.deepEqual(DeepSeekSearchService.normalizeResults({ results: [] }), []);
  assert.throws(() => DeepSeekSearchService.normalizeResults({ results: 'invalid' }), /搜索响应/);
  assert.throws(() => DeepSeekSearchService.normalizeResults(null), /搜索响应/);
  assert.throws(() => DeepSeekSearchService.normalizeResults({ results: [{ title: '缺少链接' }] }), /搜索响应/);
});

test('uses explicit Markdown link destinations instead of conflicting numeric labels for source attribution', () => {
  const data = DeepSeekSearchService.attachSearchMetadata({
    choices: [{ message: { content: '资料[1](https://competitor.cn/review)，另见[3](https://other.cn/info)。' } }]
  }, results, '轮胎推荐');

  assert.deepEqual(data.choices[0].message.annotations, [{
    type: 'url_citation', url_citation: { url: 'https://competitor.cn/review', title: '竞品资料' }
  }]);
});

test('adds only actually referenced search sources without modifying the original answer', () => {
  const content = '参考品牌参数[1]，以及 https://competitor.cn/review?utm_source=chat。不支持的来源[99]。';
  const original = { choices: [{ message: { role: 'assistant', content } }], usage: { total_tokens: 100 } };
  const data = DeepSeekSearchService.attachSearchMetadata(original, results, '轮胎推荐');
  const citations = CitationAnalysisService.extractSources({ responseText: content, aiResponse: data });

  assert.equal(data.choices[0].message.content, content);
  assert.equal(original.choices[0].message.annotations, undefined);
  assert.equal(data.usage.total_tokens, 100);
  assert.deepEqual(data.deepseek_search, { status: 'completed', query: '轮胎推荐', result_count: 3 });
  assert.deepEqual(data.choices[0].message.annotations.map((item) => item.url_citation.url), ['https://brand.cn/guide', 'https://competitor.cn/review']);
  assert.equal(citations.citation_count, 2);
  assert.equal(citations.sources.every((source) => source.source_origin === 'web_search'), true);
  assert.equal(citations.sources.some((source) => source.domain === 'unused.cn'), false);
});

test('preserves provider annotations and leaves unused or absent search results out of citation metrics', () => {
  const annotation = { type: 'url_citation', url_citation: { url: 'https://other.cn/info', title: '其他资料' } };
  const original = { choices: [{ message: { content: '资料不足，无法确认。', annotations: [annotation] } }] };
  const data = DeepSeekSearchService.attachSearchMetadata(original, results, '轮胎推荐');
  assert.deepEqual(data.choices[0].message.annotations, [annotation]);
  assert.equal(CitationAnalysisService.extractSources({ aiResponse: data }).citation_count, 1);

  const empty = DeepSeekSearchService.attachSearchMetadata({ choices: [{ message: { content: '没有找到资料。' } }] }, [], '轮胎推荐');
  assert.equal(empty.deepseek_search.status, 'empty');
  assert.equal(CitationAnalysisService.extractSources({ aiResponse: empty }).citation_count, 0);
});

function restoreEnv(key, value) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

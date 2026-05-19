const test = require('node:test');
const assert = require('node:assert/strict');

const ProjectFieldNormalizationService = require('../services/ProjectFieldNormalizationService');

test('normalizes project list fields by splitting, trimming and deduplicating canonically', () => {
  assert.deepEqual(
    ProjectFieldNormalizationService.normalizeList([' Goodie AI ', 'goodie ai', 'GoodieAI', 'Goodie AI']),
    ['Goodie AI', 'GoodieAI']
  );

  assert.deepEqual(
    ProjectFieldNormalizationService.normalizeList('米其林, Michelin\nmichelin； 米其林 '),
    ['米其林', 'Michelin']
  );
});

test('normalizes project payload fields and removes brand-name duplicates from brand keywords', () => {
  const payload = ProjectFieldNormalizationService.normalizeProjectPayload({
    name: ' Goodie AI ',
    aliases: ['GoodieAI', 'goodie ai', '  '],
    industry: ' AI 搜索优化 ',
    website: ' https://goodie.ai ',
    primary_keywords: ['Goodie AI', 'GoodieAI GEO', 'goodieai geo', ' GEO 监测 ']
  });

  assert.deepEqual(payload, {
    name: 'Goodie AI',
    aliases: ['GoodieAI'],
    industry: 'AI 搜索优化',
    website: 'https://goodie.ai',
    primary_keywords: ['GoodieAI GEO', 'GEO 监测']
  });
});

test('normalizes brand and competitor website fields to root https domains', () => {
  assert.equal(
    ProjectFieldNormalizationService.normalizeWebsite(' www.Goodie.ai/path?utm_source=test#section '),
    'https://goodie.ai'
  );
  assert.equal(
    ProjectFieldNormalizationService.normalizeWebsite('http://SHOP.Michelin.com.cn/tyres'),
    'https://shop.michelin.com.cn'
  );
  assert.equal(ProjectFieldNormalizationService.normalizeWebsite('   '), null);
});

test('drops non-domain website placeholder text instead of storing fake domains', () => {
  assert.equal(ProjectFieldNormalizationService.normalizeWebsite('品牌官网'), null);
  assert.equal(ProjectFieldNormalizationService.normalizeWebsite('来源：竞品资料'), null);
});

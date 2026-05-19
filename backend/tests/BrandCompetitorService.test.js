const test = require('node:test');
const assert = require('node:assert/strict');

const BrandCompetitorService = require('../services/BrandCompetitorService');

test('normalizes competitor names for duplicate detection', () => {
  assert.equal(
    BrandCompetitorService.canonicalName('  米其林 中国 '),
    BrandCompetitorService.canonicalName('米其林中国')
  );
  assert.equal(
    BrandCompetitorService.canonicalName('Continental Tires'),
    BrandCompetitorService.canonicalName('continental tires')
  );
  assert.equal(
    BrandCompetitorService.canonicalName('Goodie-AI_GEO'),
    BrandCompetitorService.canonicalName('goodie ai.geo')
  );
});

test('finds duplicate competitors by name or alias and ignores edited row', () => {
  const rows = [
    { id: 1, name: '马牌', aliases: ['Continental'] },
    { id: 2, name: '普利司通', aliases: ['Bridgestone'] }
  ];

  assert.deepEqual(BrandCompetitorService.findDuplicateInRows({ name: 'continental' }, rows), rows[0]);
  assert.deepEqual(BrandCompetitorService.findDuplicateInRows({ name: '固特异', aliases: ['Bridgestone'] }, rows), rows[1]);
  assert.equal(BrandCompetitorService.findDuplicateInRows({ name: '马牌' }, rows, 1), null);
});

test('detects competitor terms that match the project brand', () => {
  const brand = { name: '米其林', aliases: ['Michelin'] };

  assert.equal(BrandCompetitorService.matchesBrand({ name: 'Michelin' }, brand), true);
  assert.equal(BrandCompetitorService.matchesBrand({ name: '马牌', aliases: ['米其林'] }, brand), true);
  assert.equal(BrandCompetitorService.matchesBrand({ name: '马牌', aliases: ['Continental'] }, brand), false);
});

test('detects competitor websites that overlap with the project brand website', () => {
  const brand = { name: '米其林', website: 'https://www.michelin.com.cn' };

  assert.equal(BrandCompetitorService.matchesBrandWebsite({ website: 'https://michelin.com.cn/about' }, brand), true);
  assert.equal(BrandCompetitorService.matchesBrandWebsite({ website: 'https://shop.michelin.com.cn' }, brand), true);
  assert.equal(BrandCompetitorService.matchesBrandWebsite({ website: 'https://continental.cn' }, brand), false);
  assert.equal(BrandCompetitorService.matchesBrandWebsite({ website: '' }, brand), false);
  assert.equal(BrandCompetitorService.matchesBrandWebsite({ website: '品牌官网' }, brand), false);
});

test('finds competitor conflicts when a project brand is renamed', () => {
  const competitors = [
    { id: 1, name: '马牌', aliases: ['Continental'] },
    { id: 2, name: '普利司通', aliases: ['Bridgestone'] }
  ];

  assert.deepEqual(BrandCompetitorService.findBrandConflictInRows({ name: 'Continental' }, competitors), competitors[0]);
  assert.deepEqual(BrandCompetitorService.findBrandConflictInRows({ name: '固特异', aliases: ['bridgestone'] }, competitors), competitors[1]);
  assert.equal(BrandCompetitorService.findBrandConflictInRows({ name: '米其林', aliases: ['Michelin'] }, competitors), null);
});

test('finds competitor website conflicts when a project brand website changes', () => {
  const competitors = [
    { id: 1, name: '马牌', website: 'https://continental.cn' },
    { id: 2, name: '普利司通', website: 'https://bridgestone.cn' }
  ];

  assert.deepEqual(BrandCompetitorService.findBrandWebsiteConflictInRows({ website: 'https://www.continental.cn' }, competitors), competitors[0]);
  assert.equal(BrandCompetitorService.findBrandWebsiteConflictInRows({ website: 'https://michelin.com.cn' }, competitors), null);
});

test('finds duplicate competitor websites and ignores the edited competitor', () => {
  const competitors = [
    { id: 1, name: '马牌', website: 'https://continental.cn' },
    { id: 2, name: '普利司通', website: 'https://bridgestone.cn' }
  ];

  assert.deepEqual(BrandCompetitorService.findWebsiteConflictInRows({ website: 'https://www.continental.cn/about' }, competitors), competitors[0]);
  assert.equal(BrandCompetitorService.findWebsiteConflictInRows({ website: 'https://www.continental.cn/about' }, competitors, 1), null);
  assert.equal(BrandCompetitorService.findWebsiteConflictInRows({ website: 'https://goodyear.cn' }, competitors), null);
});

test('ignores invalid historical website placeholders during website conflict checks', () => {
  const competitors = [
    { id: 1, name: '马牌', website: '品牌官网' },
    { id: 2, name: '普利司通', website: '来源：竞品资料' }
  ];

  assert.equal(BrandCompetitorService.findWebsiteConflictInRows({ website: '品牌官网' }, competitors), null);
  assert.equal(BrandCompetitorService.websitesOverlap('品牌官网', '品牌官网'), false);
});

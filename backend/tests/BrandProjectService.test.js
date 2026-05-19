const test = require('node:test');
const assert = require('node:assert/strict');

const BrandProjectService = require('../services/BrandProjectService');

test('finds duplicate active brand projects by name or alias', () => {
  const rows = [
    { id: 1, name: '米其林', aliases: ['Michelin'], status: 'active' },
    { id: 2, name: '马牌', aliases: ['Continental'], status: 'active' }
  ];

  assert.deepEqual(BrandProjectService.findDuplicateInRows({ name: 'michelin' }, rows), rows[0]);
  assert.deepEqual(BrandProjectService.findDuplicateInRows({ name: 'Goodie', aliases: ['continental'] }, rows), rows[1]);
  assert.equal(BrandProjectService.findDuplicateInRows({ name: '米其林' }, rows, 1), null);
});

test('finds duplicate brand projects across compact English spellings', () => {
  const rows = [
    { id: 1, name: 'Goodie AI', aliases: ['GoodieAI GEO'], status: 'active' }
  ];

  assert.deepEqual(BrandProjectService.findDuplicateInRows({ name: 'GoodieAI' }, rows), rows[0]);
  assert.deepEqual(BrandProjectService.findDuplicateInRows({ name: 'Goodie', aliases: ['Goodie AI GEO'] }, rows), rows[0]);
});

test('ignores archived brand projects when checking duplicates', () => {
  const rows = [
    { id: 1, name: '米其林', aliases: ['Michelin'], status: 'archived' }
  ];

  assert.equal(BrandProjectService.findDuplicateInRows({ name: '米其林' }, rows), null);
});

test('finds duplicate active brand projects by normalized website', () => {
  const rows = [
    { id: 1, website: 'https://brand.cn', status: 'active' },
    { id: 2, website: 'https://archived.cn', status: 'archived' }
  ];

  assert.deepEqual(
    BrandProjectService.findWebsiteDuplicateInRows({ website: 'www.brand.cn/path?utm_source=x' }, rows),
    rows[0]
  );
  assert.equal(BrandProjectService.findWebsiteDuplicateInRows({ website: 'archived.cn' }, rows), null);
  assert.equal(BrandProjectService.findWebsiteDuplicateInRows({ website: 'brand.cn' }, rows, 1), null);
});

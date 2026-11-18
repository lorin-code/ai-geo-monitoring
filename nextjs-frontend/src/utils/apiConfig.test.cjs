/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const { getApiRewrites } = require('../../config/api.cjs');

test('the proxy follows API_BASE_URL, preserving /api exactly once', () => {
  for (const API_BASE_URL of ['https://backend.example:4567', ' https://backend.example:4567/ ']) {
    assert.deepEqual(getApiRewrites({ API_BASE_URL }), [{
      source: '/api/:path*', destination: 'https://backend.example:4567/api/:path*'
    }]);
  }
});

test('missing proxy configuration leaves routing to the external proxy, with no localhost fallback', () => {
  assert.deepEqual(getApiRewrites({}), []);
  assert.deepEqual(getApiRewrites({ API_BASE_URL: '  ' }), []);
});

test('invalid backend origins are rejected instead of duplicating /api or leaking URL credentials', () => {
  for (const API_BASE_URL of ['backend.example', '/api', 'ftp://backend.example',
    'https://backend.example/api', 'https://user:secret@backend.example', 'https://backend.example?token=secret']) {
    assert.throws(() => getApiRewrites({ API_BASE_URL }), (error) => /API_BASE_URL/.test(error.message) && !/secret/.test(error.message));
  }
});

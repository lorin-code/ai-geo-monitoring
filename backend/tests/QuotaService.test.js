const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveQuotaUserId } = require('../middleware/quota');

test('allows route-level quota checks to target the project owner instead of the actor', () => {
  const req = { user: { id: 1, role: 'admin' } };

  assert.equal(resolveQuotaUserId(req, { userId: 9 }), 9);
  assert.equal(resolveQuotaUserId(req), 1);
});

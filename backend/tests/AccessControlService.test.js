const test = require('node:test');
const assert = require('node:assert/strict');

const AccessControlService = require('../services/AccessControlService');

test('allows admins or the same user to access user scoped resources', () => {
  assert.equal(AccessControlService.canAccessUser({ id: 1, role: 'admin' }, 99), true);
  assert.equal(AccessControlService.canAccessUser({ id: 2, role: 'user' }, '2'), true);
  assert.equal(AccessControlService.canAccessUser({ id: 2, role: 'user' }, 3), false);
  assert.equal(AccessControlService.canAccessUser(null, 2), false);
});

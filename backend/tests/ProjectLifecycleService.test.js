const test = require('node:test');
const assert = require('node:assert/strict');

const ProjectLifecycleService = require('../services/ProjectLifecycleService');

test('allows active projects to mutate child resources', () => {
  const result = ProjectLifecycleService.validateActiveProject({ id: 2, status: 'active' }, '归档项目不能修改资源');

  assert.deepEqual(result, { ok: true });
});

test('rejects archived projects from mutating child resources', () => {
  const result = ProjectLifecycleService.validateActiveProject({ id: 2, status: 'archived' }, '归档项目不能修改资源');

  assert.deepEqual(result, {
    ok: false,
    status: 400,
    message: '归档项目不能修改资源'
  });
});

test('allows archived projects to be restored without other edits', () => {
  const result = ProjectLifecycleService.validateProjectUpdate({ id: 2, status: 'archived' }, { status: 'active' });

  assert.deepEqual(result, { ok: true });
});

test('rejects archived project edits unless the request only restores it', () => {
  assert.deepEqual(
    ProjectLifecycleService.validateProjectUpdate({ id: 2, status: 'archived' }, { name: '新名称' }),
    {
      ok: false,
      status: 400,
      message: '归档项目请先恢复后再编辑'
    }
  );
  assert.deepEqual(
    ProjectLifecycleService.validateProjectUpdate({ id: 2, status: 'archived' }, { status: 'active', name: '新名称' }),
    {
      ok: false,
      status: 400,
      message: '归档项目请先恢复后再编辑'
    }
  );
});

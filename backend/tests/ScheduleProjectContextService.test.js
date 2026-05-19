const test = require('node:test');
const assert = require('node:assert/strict');

const ScheduleProjectContextService = require('../services/ScheduleProjectContextService');

test('attributes project schedules created by an admin to the project owner', async () => {
  const context = await ScheduleProjectContextService.resolveProjectContext({
    user: { id: 1, role: 'admin' },
    source: { project_id: 2, tracked_prompt_id: 7 },
    repositories: {
      BrandProject: {
        findByPk: async () => ({ id: 2, user_id: 9, platforms: ['doubao', 'deepseek'] })
      },
      TrackedPrompt: {
        findOne: async () => ({ id: 7, project_id: 2, platforms: ['deepseek'] })
      }
    }
  });

  assert.equal(context.project_id, 2);
  assert.equal(context.tracked_prompt_id, 7);
  assert.equal(context.user_id, 9);
  assert.equal(context.actor_user_id, 1);
  assert.deepEqual(context.project_platforms, ['doubao', 'deepseek']);
  assert.deepEqual(context.prompt_platforms, ['deepseek']);
  assert.deepEqual(context.allowed_platforms, ['deepseek']);
});

test('uses project platforms as the allowed platform scope when no prompt is selected', async () => {
  const context = await ScheduleProjectContextService.resolveProjectContext({
    user: { id: 9, role: 'user' },
    source: { project_id: 2 },
    repositories: {
      BrandProject: {
        findByPk: async () => ({ id: 2, user_id: 9, status: 'active', platforms: ['doubao'] })
      }
    }
  });

  assert.equal(context.project_id, 2);
  assert.deepEqual(context.allowed_platforms, ['doubao']);
});

test('validates detection platforms within the selected project or prompt scope', async () => {
  assert.deepEqual(
    ScheduleProjectContextService.validatePlatformsWithinContext(['deepseek'], {
      project_id: 2,
      allowed_platforms: ['deepseek']
    }).platforms,
    ['deepseek']
  );

  const invalid = ScheduleProjectContextService.validatePlatformsWithinContext(['doubao'], {
    project_id: 2,
    allowed_platforms: ['deepseek']
  });

  assert.equal(invalid.ok, false);
  assert.match(invalid.message, /项目或 Prompt/);
});

test('defaults project detection platforms to available platforms inside the project scope', () => {
  assert.deepEqual(
    ScheduleProjectContextService.defaultPlatformsForContext(['doubao', 'deepseek'], {
      project_id: 2,
      allowed_platforms: ['deepseek']
    }),
    ['deepseek']
  );
});

test('rejects schedules for archived projects', async () => {
  const context = await ScheduleProjectContextService.resolveProjectContext({
    user: { id: 9, role: 'user' },
    source: { project_id: 2, tracked_prompt_id: 7 },
    repositories: {
      BrandProject: {
        findByPk: async () => ({ id: 2, user_id: 9, status: 'archived' })
      },
      TrackedPrompt: {
        findOne: async () => ({ id: 7, project_id: 2 })
      }
    }
  });

  assert.deepEqual(context, {
    error: { status: 400, message: '归档项目不能创建或更新定时任务' }
  });
});

test('rejects schedules for disabled prompts', async () => {
  const context = await ScheduleProjectContextService.resolveProjectContext({
    user: { id: 9, role: 'user' },
    source: { project_id: 2, tracked_prompt_id: 7 },
    repositories: {
      BrandProject: {
        findByPk: async () => ({ id: 2, user_id: 9, status: 'active' })
      },
      TrackedPrompt: {
        findOne: async () => ({ id: 7, project_id: 2, enabled: false })
      }
    }
  });

  assert.deepEqual(context, {
    error: { status: 400, message: '停用 Prompt 不能创建或更新定时任务' }
  });
});

test('supports custom messages for detection project contexts', async () => {
  const context = await ScheduleProjectContextService.resolveProjectContext({
    user: { id: 9, role: 'user' },
    source: { project_id: 2, tracked_prompt_id: 7 },
    messages: {
      archivedProject: '归档项目不能运行检测'
    },
    repositories: {
      BrandProject: {
        findByPk: async () => ({ id: 2, user_id: 9, status: 'archived' })
      },
      TrackedPrompt: {
        findOne: async () => ({ id: 7, project_id: 2 })
      }
    }
  });

  assert.deepEqual(context, {
    error: { status: 400, message: '归档项目不能运行检测' }
  });
});

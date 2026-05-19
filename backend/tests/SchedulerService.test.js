const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { BrandProject, DetectionSchedule, QuestionRecord, TrackedPrompt, User } = require('../models');
const ProjectRunService = require('../services/ProjectRunService');
const SchedulerService = require('../services/SchedulerService');

test('normalizes project monitoring settings for mainland platforms', () => {
  const payload = SchedulerService.normalizeProjectMonitoring({
    monitoring_enabled: true,
    monitoring_time: '8:5',
    platforms: ['deepseek', 'kimi', 'doubao']
  });

  assert.equal(payload.monitoring_enabled, true);
  assert.equal(payload.monitoring_time, '08:05');
  assert.deepEqual(payload.platforms, ['deepseek', 'doubao']);
});

test('normalizes legacy project schedule platforms within the project platform scope', () => {
  assert.deepEqual(
    SchedulerService.normalizeSchedulePlatforms(['doubao', 'deepseek', 'kimi'], {
      id: 2,
      platforms: ['deepseek']
    }),
    ['deepseek']
  );
  assert.deepEqual(
    SchedulerService.normalizeSchedulePlatforms(['kimi'], {
      id: 2,
      platforms: ['doubao']
    }),
    []
  );
  assert.deepEqual(
    SchedulerService.normalizeSchedulePlatforms(['doubao', 'kimi']),
    ['doubao']
  );
});

test('marks scheduled project records as failed when metric generation fails', async () => {
  const updates = [];
  const result = await SchedulerService.finalizeScheduledProjectRecord({
    record: {
      id: 11,
      project_id: 2,
      user_id: 9,
      update: async (payload) => updates.push(payload)
    },
    responseText: '米其林静音轮胎不错',
    aiResponse: {},
    keywords: ['米其林'],
    repositories: {
      BrandProject: {
        findByPk: async () => ({ id: 2, name: '米其林' })
      },
      BrandCompetitor: {
        findAll: async () => []
      },
      TrackedPrompt: {
        findOne: async () => null
      }
    },
    projectRunService: {
      finalizeSuccessfulRecord: async () => {
        throw new Error('metric write failed');
      }
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 'failed');
  assert.equal(updates.length, 1);
  assert.equal(updates[0].status, 'failed');
  assert.equal(updates[0].error_message, '指标生成失败，请稍后重试');
  assert.equal(result.error.message, '指标生成失败，请稍后重试');
});

test('scheduled detections guard empty AI responses before creating result details', () => {
  const source = fs.readFileSync(path.join(__dirname, '../services/SchedulerService.js'), 'utf8');
  const extractIndex = source.indexOf('const originalText = ResultParserService.extractResponseText');
  const detailIndex = source.indexOf('await ResultDetail.create', extractIndex);
  const guardIndex = source.indexOf('监测平台返回内容为空', extractIndex);

  assert.ok(extractIndex > 0);
  assert.ok(detailIndex > extractIndex);
  assert.ok(guardIndex > extractIndex);
  assert.ok(guardIndex < detailIndex);
});

test('scheduled platform failures store safe error messages', () => {
  const source = fs.readFileSync(path.join(__dirname, '../services/SchedulerService.js'), 'utf8');

  assert.match(source, /SAFE_PLATFORM_FAILURE_MESSAGE/);
  assert.doesNotMatch(source, /error_message:\s*result\.error/);
});

test('scheduled query exceptions mark created records as failed', () => {
  const source = fs.readFileSync(path.join(__dirname, '../services/SchedulerService.js'), 'utf8');

  assert.match(source, /let rec = null/);
  assert.match(source, /catch \(e\)[\s\S]*QuestionRecord\.update\([\s\S]*SAFE_PLATFORM_FAILURE_MESSAGE/);
});

test('recovers stale pending project records as failed', async () => {
  const originalUpdate = QuestionRecord.update;
  const calls = [];
  QuestionRecord.update = async (...args) => {
    calls.push(args);
    return [2];
  };

  try {
    const recovered = await SchedulerService.recoverStalePendingRecords({
      now: new Date('2026-05-19T13:30:00.000Z'),
      maxAgeMs: 20 * 60 * 1000
    });

    assert.equal(recovered, 2);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0][0], {
      status: 'failed',
      error_message: '分析任务中断，请重新运行'
    });
    assert.equal(calls[0][1].where.status, 'pending');
    assert.ok(calls[0][1].where.created_at);
  } finally {
    QuestionRecord.update = originalUpdate;
  }
});

test('manual scheduled runs only succeed when at least one platform completes', () => {
  const source = fs.readFileSync(path.join(__dirname, '../services/SchedulerService.js'), 'utf8');

  assert.match(source, /let completed = 0/);
  assert.match(source, /return \{ ok: completed > 0, completed, failed, attempted \}/);
  assert.match(source, /const result = await submitDetectionForSchedule\(s, \{ projectValidated: true, project: guard\.project \}\)/);
  assert.match(source, /if \(!result\?\.ok\) return false/);
});

test('automatic scheduled runs advance after attempted platform failures', () => {
  const source = fs.readFileSync(path.join(__dirname, '../services/SchedulerService.js'), 'utf8');

  assert.match(source, /const result = await submitDetectionForSchedule\(s\)/);
  assert.match(source, /if \(!result\?\.ok && !result\?\.attempted\) continue/);
  assert.match(source, /await s\.update\(\{ last_run_at: now, next_run_at: next \}\)/);
});

test('scheduled runs only count finalized records as completed', () => {
  const source = fs.readFileSync(path.join(__dirname, '../services/SchedulerService.js'), 'utf8');

  assert.match(source, /const finalization = await finalizeScheduledProjectRecord/);
  assert.match(source, /if \(finalization\?\.ok\) \{\s*completed \+= 1;\s*\} else \{\s*failed \+= 1;\s*\}/);
  assert.doesNotMatch(source, /await finalizeScheduledProjectRecord\([\s\S]*?\);\s*completed \+= 1;/);
});

test('disables prompt schedules for archived projects before execution', async () => {
  const updates = [];
  const result = await SchedulerService.validateScheduleProject({
    project_id: 2,
    update: async (payload) => updates.push(payload)
  }, {
    BrandProject: {
      findByPk: async () => ({ id: 2, status: 'archived' })
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, '项目已归档');
  assert.deepEqual(updates, [{ enabled: false }]);
});

test('does not manually advance an archived project schedule', async () => {
  const originalFindSchedule = DetectionSchedule.findByPk;
  const originalFindProject = BrandProject.findByPk;
  const updates = [];

  DetectionSchedule.findByPk = async () => ({
    id: 5,
    project_id: 2,
    daily_time: '09:00',
    timezone: 'UTC',
    update: async (payload) => updates.push(payload)
  });
  BrandProject.findByPk = async () => ({ id: 2, status: 'archived' });

  try {
    const result = await SchedulerService.runNow(5);

    assert.equal(result, false);
    assert.deepEqual(updates, [{ enabled: false }]);
  } finally {
    DetectionSchedule.findByPk = originalFindSchedule;
    BrandProject.findByPk = originalFindProject;
  }
});

test('does not auto advance an archived project schedule during tick', async () => {
  const originalFindSchedules = DetectionSchedule.findAll;
  const originalFindProjects = BrandProject.findAll;
  const originalFindProject = BrandProject.findByPk;
  const updates = [];

  DetectionSchedule.findAll = async () => [{
    id: 5,
    project_id: 2,
    daily_time: '09:00',
    timezone: 'UTC',
    update: async (payload) => updates.push(payload)
  }];
  BrandProject.findAll = async () => [];
  BrandProject.findByPk = async () => ({ id: 2, status: 'archived' });

  try {
    await SchedulerService.tick();

    assert.deepEqual(updates, [{ enabled: false }]);
  } finally {
    DetectionSchedule.findAll = originalFindSchedules;
    BrandProject.findAll = originalFindProjects;
    BrandProject.findByPk = originalFindProject;
  }
});

test('disables prompt schedules when the tracked prompt is disabled', async () => {
  const updates = [];
  const result = await SchedulerService.validateScheduleProject({
    project_id: 2,
    tracked_prompt_id: 7,
    update: async (payload) => updates.push(payload)
  }, {
    BrandProject: {
      findByPk: async () => ({ id: 2, status: 'active' })
    },
    TrackedPrompt: {
      findOne: async () => ({ id: 7, project_id: 2, enabled: false })
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'Prompt 已停用或不存在');
  assert.deepEqual(updates, [{ enabled: false }]);
});

test('advances project monitoring schedule after a failed project run attempt', async () => {
  const originalFindProject = BrandProject.findByPk;
  const originalFindPrompts = TrackedPrompt.findAll;
  const originalFindUser = User.findByPk;
  const originalRunProject = ProjectRunService.runProject;
  const updates = [];

  BrandProject.findByPk = async () => ({
    id: 2,
    user_id: 9,
    monitoring_enabled: true,
    toJSON: () => ({
      id: 2,
      user_id: 9,
      monitoring_enabled: true,
      monitoring_time: '09:00',
      platforms: ['deepseek']
    }),
    update: async (payload) => updates.push(payload)
  });
  TrackedPrompt.findAll = async () => [{ toJSON: () => ({ id: 3, question: '静音轮胎怎么选', enabled: true }) }];
  User.findByPk = async () => ({ id: 9, role: 'user' });
  ProjectRunService.runProject = async () => ({ ok: false, status: 400, message: '没有可运行的启用 Prompt' });

  try {
    const result = await SchedulerService.runProjectNow(2);

    assert.equal(result, false);
    assert.equal(updates.length, 1);
    assert.equal(updates[0].monitoring_time, '09:00');
    assert.ok(updates[0].monitoring_next_run_at instanceof Date);
    assert.equal(Object.hasOwn(updates[0], 'monitoring_last_run_at'), false);
  } finally {
    BrandProject.findByPk = originalFindProject;
    TrackedPrompt.findAll = originalFindPrompts;
    User.findByPk = originalFindUser;
    ProjectRunService.runProject = originalRunProject;
  }
});

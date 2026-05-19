const test = require('node:test');
const assert = require('node:assert/strict');

const { QuestionRecord, ResultDetail } = require('../models');
const AIPlatformService = require('../services/AIPlatformService');
const ProjectRunService = require('../services/ProjectRunService');
const SentimentAnalysisService = require('../services/SentimentAnalysisService');
const AlertEvaluationService = require('../services/AlertEvaluationService');

test('builds project run targets from enabled prompts and project platforms', () => {
  const targets = ProjectRunService.buildPromptTargets([
    { id: 1, question: '问题一', enabled: true, platforms: ['doubao', 'deepseek', 'kimi'] },
    { id: 2, question: '问题二', enabled: false, platforms: ['doubao'] },
    { id: 3, question: '问题三', enabled: true, platforms: [] }
  ], ['doubao', 'deepseek'], ['deepseek']);

  assert.deepEqual(targets, [
    { prompt: { id: 1, question: '问题一', enabled: true, platforms: ['doubao', 'deepseek', 'kimi'] }, platform: 'deepseek' },
    { prompt: { id: 3, question: '问题三', enabled: true, platforms: [] }, platform: 'deepseek' }
  ]);
});

test('intersects prompt platforms with project platforms when building run targets', () => {
  const targets = ProjectRunService.buildPromptTargets([
    { id: 1, question: '只跑豆包', enabled: true, platforms: ['doubao'] },
    { id: 2, question: '只跑 DeepSeek', enabled: true, platforms: ['deepseek'] },
    { id: 3, question: '继承项目平台', enabled: true, platforms: [] }
  ], ['doubao', 'deepseek'], ['doubao', 'deepseek']);

  assert.deepEqual(targets, [
    { prompt: { id: 1, question: '只跑豆包', enabled: true, platforms: ['doubao'] }, platform: 'doubao' },
    { prompt: { id: 2, question: '只跑 DeepSeek', enabled: true, platforms: ['deepseek'] }, platform: 'deepseek' },
    { prompt: { id: 3, question: '继承项目平台', enabled: true, platforms: [] }, platform: 'doubao' },
    { prompt: { id: 3, question: '继承项目平台', enabled: true, platforms: [] }, platform: 'deepseek' }
  ]);
});

test('rejects prompt targets outside the selected project platforms', () => {
  const targets = ProjectRunService.buildPromptTargets([
    { id: 1, question: '只跑豆包', enabled: true, platforms: ['doubao'] }
  ], ['doubao', 'deepseek'], ['deepseek']);

  assert.deepEqual(targets, []);
});

test('only active projects are runnable', () => {
  assert.equal(ProjectRunService.isRunnableProject({ status: 'active' }), true);
  assert.equal(ProjectRunService.isRunnableProject({ status: 'archived' }), false);
  assert.equal(ProjectRunService.isRunnableProject(null), false);
});

test('attributes admin initiated project runs to the project owner', () => {
  const owner = ProjectRunService.resolveRunUser(
    { id: 2, user_id: 9 },
    { id: 1, role: 'admin', username: 'admin' }
  );
  const regularUser = ProjectRunService.resolveRunUser(
    { id: 2, user_id: 9 },
    { id: 9, role: 'user', username: 'owner' }
  );

  assert.equal(owner.id, 9);
  assert.equal(owner.actor_user_id, 1);
  assert.equal(regularUser.id, 9);
  assert.equal(regularUser.actor_user_id, undefined);
});

test('normalizes explicit run prompt ids without falling back to all prompts', () => {
  assert.deepEqual(ProjectRunService.normalizeRunPromptIds(undefined), {
    explicit: false,
    ids: []
  });

  assert.deepEqual(ProjectRunService.normalizeRunPromptIds(['3', 'bad', 3, 0]), {
    explicit: true,
    ids: [3]
  });

  assert.deepEqual(ProjectRunService.normalizeRunPromptIds('bad'), {
    explicit: true,
    ids: []
  });
});

test('reports selected prompt availability separately from api key availability', async () => {
  const result = await ProjectRunService.runProject({
    project: { id: 1, user_id: 1, status: 'active', platforms: ['deepseek'] },
    prompts: [],
    platforms: ['deepseek'],
    user: { id: 1, role: 'user' },
    promptSelectionExplicit: true
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.equal(result.message, '选择的 Prompt 不存在或已停用');
});

test('reports prompt and project platform mismatch separately from api key availability', async () => {
  const result = await ProjectRunService.runProject({
    project: { id: 1, user_id: 1, status: 'active', platforms: ['deepseek'] },
    prompts: [{ id: 2, question: '只跑豆包', enabled: true, platforms: ['doubao'] }],
    platforms: ['deepseek'],
    user: { id: 1, role: 'user' }
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.equal(result.message, 'Prompt 的监测平台与项目监测平台不一致，请检查品牌项目监测平台设置');
});

test('rejects explicit project runs when any selected prompt has no project platform overlap', async () => {
  const result = await ProjectRunService.runProject({
    project: { id: 1, user_id: 1, status: 'active', platforms: ['deepseek'] },
    prompts: [
      { id: 2, question: 'DeepSeek 可运行', enabled: true, platforms: ['deepseek'] },
      { id: 3, question: '只跑豆包', enabled: true, platforms: ['doubao'] }
    ],
    platforms: ['deepseek'],
    user: { id: 1, role: 'user' },
    promptSelectionExplicit: true
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.equal(result.message, 'Prompt 的监测平台与项目监测平台不一致，请检查品牌项目监测平台设置');
});

test('builds keyword stats list from brand, aliases and brand product terms', () => {
  const keywords = ProjectRunService.buildBrandKeywordList({
    name: '米其林',
    aliases: ['Michelin', '米其林'],
    primary_keywords: ['静音轮胎', '米其林静音轮胎', '轮胎', 'Michelin Pilot Sport']
  });

  assert.deepEqual(keywords, ['米其林', 'Michelin', '米其林静音轮胎', 'Michelin Pilot Sport']);
});

test('derives prompt category from tags before question text', () => {
  assert.equal(ProjectRunService.derivePromptCategory({
    question: '米其林和马牌哪个更适合家用',
    tags: ['竞品对比', '轮胎']
  }), '竞品对比');

  assert.equal(ProjectRunService.derivePromptCategory({
    question: '买静音轮胎主要看哪些参数',
    tags: []
  }), '购买决策');
});

test('derives prompt categories from common user question intents', () => {
  assert.equal(ProjectRunService.derivePromptCategory({ question: '豆包的替代方案有哪些' }), '替代方案');
  assert.equal(ProjectRunService.derivePromptCategory({ question: '新能源车轮胎价格' }), '价格成本');
  assert.equal(ProjectRunService.derivePromptCategory({ question: '轮胎售后风险有哪些' }), '风险顾虑');
  assert.equal(ProjectRunService.derivePromptCategory({ question: 'DeepSeek 和豆包哪个更适合内容团队' }), '竞品对比');
});

test('marks a completed AI response as failed when metric generation fails', async () => {
  const originalCreateMetric = ProjectRunService.createVisibilityMetric;
  const updates = [];
  ProjectRunService.createVisibilityMetric = async () => {
    throw new Error('metric write failed');
  };

  try {
    const result = await ProjectRunService.finalizeSuccessfulRecord({
      record: {
        id: 12,
        update: async (payload) => updates.push(payload)
      },
      responseText: '米其林静音轮胎不错',
      aiResponse: {},
      project: { id: 2, name: '米其林' },
      competitors: [],
      prompt: { id: 3, question: '静音轮胎怎么选' },
      keywords: ['米其林']
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, 'failed');
    assert.equal(updates.length, 1);
    assert.equal(updates[0].status, 'failed');
    assert.equal(updates[0].error_message, '指标生成失败，请稍后重试');
    assert.equal(result.error, '指标生成失败，请稍后重试');
  } finally {
    ProjectRunService.createVisibilityMetric = originalCreateMetric;
  }
});

test('deduplicates overlapping brand keywords in record keyword counts', async () => {
  const originalCreateMetric = ProjectRunService.createVisibilityMetric;
  const updates = [];
  ProjectRunService.createVisibilityMetric = async () => ({ id: 99 });

  try {
    const result = await ProjectRunService.finalizeSuccessfulRecord({
      record: {
        id: 12,
        update: async (payload) => updates.push(payload)
      },
      responseText: '豆包大模型适合中文内容生产，DeepSeek 适合代码场景。',
      aiResponse: {},
      project: { id: 2, name: '豆包', primary_keywords: ['豆包大模型'] },
      competitors: [],
      prompt: { id: 3, question: 'AI 平台怎么选' },
      keywords: ['豆包', '豆包大模型']
    });

    assert.equal(result.ok, true);
    assert.deepEqual(result.keyword_counts, [
      { keyword: '豆包大模型', count: 1 }
    ]);
    assert.deepEqual(updates[0].result_summary.keyword_counts, [
      { keyword: '豆包大模型', count: 1 }
    ]);
  } finally {
    ProjectRunService.createVisibilityMetric = originalCreateMetric;
  }
});

test('counts compact brand spellings in record keyword counts without exposing compact keywords', async () => {
  const originalCreateMetric = ProjectRunService.createVisibilityMetric;
  const updates = [];
  ProjectRunService.createVisibilityMetric = async () => ({ id: 99 });

  try {
    const result = await ProjectRunService.finalizeSuccessfulRecord({
      record: {
        id: 12,
        update: async (payload) => updates.push(payload)
      },
      responseText: 'GoodieAI 适合做品牌可见度监测。',
      aiResponse: {},
      project: { id: 2, name: 'Goodie AI' },
      competitors: [],
      prompt: { id: 3, question: 'GEO 工具怎么选' },
      keywords: ['Goodie AI']
    });

    assert.equal(result.ok, true);
    assert.deepEqual(result.keyword_counts, [
      { keyword: 'Goodie AI', count: 1 }
    ]);
    assert.deepEqual(updates[0].result_summary.keyword_counts, [
      { keyword: 'Goodie AI', count: 1 }
    ]);
  } finally {
    ProjectRunService.createVisibilityMetric = originalCreateMetric;
  }
});

test('builds complete visibility metric payload for any project detection path', async () => {
  const originalAnalyze = SentimentAnalysisService.analyzeWithDeepSeek;
  SentimentAnalysisService.analyzeWithDeepSeek = async () => ({
    sentiment: 'positive',
    reason: '明确推荐品牌',
    risk_terms: ['价格高']
  });

  try {
    const payload = await ProjectRunService.buildVisibilityMetricPayload({
      record: {
        id: 9,
        user_id: 1,
        platform: 'deepseek',
        tracked_prompt_id: 3
      },
      responseText: '米其林静音轮胎值得推荐。参考 https://www.michelin.com.cn/tire?id=1',
      aiResponse: {
        citations: [
          { url: 'https://www.michelin.com.cn/tire?id=1', title: '米其林官网' }
        ]
      },
      project: {
        id: 2,
        name: '米其林',
        aliases: ['Michelin'],
        website: 'https://www.michelin.com.cn',
        primary_keywords: ['米其林静音轮胎']
      },
      competitors: [
        { name: '马牌', website: 'https://www.continental-tires.cn' }
      ],
      prompt: {
        id: 3,
        question: '静音轮胎怎么选',
        tags: ['购买决策']
      }
    });

    assert.equal(payload.project_id, 2);
    assert.equal(payload.prompt_id, 3);
    assert.equal(payload.brand_mentioned, true);
    assert.equal(payload.brand_rank, 1);
    assert.equal(payload.brand_recommended, true);
    assert.equal(payload.citation_count, 1);
    assert.equal(payload.owned_citation_count, 1);
    assert.equal(payload.prompt_category, '购买决策');
    assert.equal(payload.sentiment, 'positive');
    assert.equal(payload.sentiment_reason, '明确推荐品牌');
    assert.deepEqual(payload.sentiment_risk_terms, ['价格高']);
  } finally {
    SentimentAnalysisService.analyzeWithDeepSeek = originalAnalyze;
  }
});

test('keeps sentiment neutral when the target brand is absent from the AI response', async () => {
  const originalAnalyze = SentimentAnalysisService.analyzeWithDeepSeek;
  let sentimentCalls = 0;
  SentimentAnalysisService.analyzeWithDeepSeek = async () => {
    sentimentCalls += 1;
    return { sentiment: 'positive' };
  };

  try {
    const payload = await ProjectRunService.buildVisibilityMetricPayload({
      record: {
        id: 10,
        user_id: 1,
        platform: 'deepseek',
        tracked_prompt_id: 4
      },
      responseText: '马牌在静音轮胎场景值得推荐，整体口碑不错。',
      aiResponse: {},
      project: {
        id: 2,
        name: '米其林',
        aliases: ['Michelin'],
        website: 'https://www.michelin.com.cn',
        primary_keywords: ['米其林静音轮胎']
      },
      competitors: [
        { name: '马牌', website: 'https://www.continental-tires.cn' }
      ],
      prompt: {
        id: 4,
        question: '静音轮胎怎么选',
        tags: ['购买决策']
      }
    });

    assert.equal(payload.brand_mentioned, false);
    assert.equal(payload.sentiment, 'neutral');
    assert.equal(sentimentCalls, 0);
  } finally {
    SentimentAnalysisService.analyzeWithDeepSeek = originalAnalyze;
  }
});

test('marks a project run target failed when platform execution throws', async () => {
  const originalCreateRecord = QuestionRecord.create;
  const originalQueryPlatform = AIPlatformService.queryPlatform;
  const originalCreateDetail = ResultDetail.create;
  const originalFinalize = ProjectRunService.finalizeSuccessfulRecord;
  const updates = [];

  QuestionRecord.create = async () => ({
    id: 21,
    update: async (payload) => updates.push(payload)
  });
  AIPlatformService.queryPlatform = async () => {
    throw new Error('network down');
  };
  ResultDetail.create = async () => {
    throw new Error('should not create detail');
  };
  ProjectRunService.finalizeSuccessfulRecord = async () => {
    throw new Error('should not finalize');
  };

  try {
    const result = await ProjectRunService.runTarget({
      target: {
        prompt: { id: 3, question: '静音轮胎怎么选' },
        platform: 'deepseek'
      },
      runUser: { id: 9 },
      projectData: { id: 2, name: '米其林' },
      competitors: [],
      keywords: ['米其林']
    });

    assert.deepEqual(result, {
      record_id: 21,
      prompt_id: 3,
      platform: 'deepseek',
      status: 'failed',
      error: '监测平台调用失败，请稍后重试'
    });
    assert.equal(updates.length, 1);
    assert.equal(updates[0].status, 'failed');
    assert.equal(updates[0].error_message, '监测平台调用失败，请稍后重试');
  } finally {
    QuestionRecord.create = originalCreateRecord;
    AIPlatformService.queryPlatform = originalQueryPlatform;
    ResultDetail.create = originalCreateDetail;
    ProjectRunService.finalizeSuccessfulRecord = originalFinalize;
  }
});

test('creates run records for every project run target before execution', async () => {
  const originalCreateRecord = QuestionRecord.create;
  const createdPayloads = [];
  QuestionRecord.create = async (payload) => {
    createdPayloads.push(payload);
    return { id: createdPayloads.length, ...payload };
  };

  try {
    const entries = await ProjectRunService.createRunEntries({
      targets: [
        { prompt: { id: 1, question: '问题一' }, platform: 'doubao' },
        { prompt: { id: 2, question: '问题二' }, platform: 'doubao' },
        { prompt: { id: 3, question: '问题三' }, platform: 'doubao' }
      ],
      runUser: { id: 9 },
      projectData: { id: 2, name: 'Goodie AI' },
      keywords: ['Goodie AI']
    });

    assert.equal(entries.length, 3);
    assert.deepEqual(entries.map((entry) => entry.record.id), [1, 2, 3]);
    assert.deepEqual(createdPayloads.map((payload) => payload.tracked_prompt_id), [1, 2, 3]);
    assert.deepEqual(createdPayloads.map((payload) => payload.status), ['pending', 'pending', 'pending']);
  } finally {
    QuestionRecord.create = originalCreateRecord;
  }
});

test('runs a prepared project run target without creating a duplicate question record', async () => {
  const originalCreateRecord = QuestionRecord.create;
  const originalQueryPlatform = AIPlatformService.queryPlatform;
  const updates = [];

  QuestionRecord.create = async () => {
    throw new Error('should reuse the prepared record');
  };
  AIPlatformService.queryPlatform = async () => ({
    success: false,
    error: '[doubao] timeout'
  });

  try {
    const result = await ProjectRunService.runTarget({
      target: {
        prompt: { id: 8, question: '开源 GEO 工具有哪些' },
        platform: 'doubao'
      },
      record: {
        id: 88,
        update: async (payload) => updates.push(payload)
      },
      runUser: { id: 9 },
      projectData: { id: 2, name: 'Goodie AI' },
      competitors: [],
      keywords: ['Goodie AI']
    });

    assert.deepEqual(result, {
      record_id: 88,
      prompt_id: 8,
      platform: 'doubao',
      status: 'failed',
      error: '监测平台调用失败，请稍后重试'
    });
    assert.deepEqual(updates[0], {
      status: 'failed',
      error_message: '监测平台调用失败，请稍后重试'
    });
  } finally {
    QuestionRecord.create = originalCreateRecord;
    AIPlatformService.queryPlatform = originalQueryPlatform;
  }
});

test('marks a project run target failed with a safe message when platform returns failure', async () => {
  const originalCreateRecord = QuestionRecord.create;
  const originalQueryPlatform = AIPlatformService.queryPlatform;
  const updates = [];

  QuestionRecord.create = async () => ({
    id: 22,
    update: async (payload) => updates.push(payload)
  });
  AIPlatformService.queryPlatform = async () => ({
    success: false,
    error: '[deepseek] 401 invalid api key'
  });

  try {
    const result = await ProjectRunService.runTarget({
      target: {
        prompt: { id: 4, question: '静音轮胎怎么选' },
        platform: 'deepseek'
      },
      runUser: { id: 9 },
      projectData: { id: 2, name: '米其林' },
      competitors: [],
      keywords: ['米其林']
    });

    assert.deepEqual(result, {
      record_id: 22,
      prompt_id: 4,
      platform: 'deepseek',
      status: 'failed',
      error: '监测平台调用失败，请稍后重试'
    });
    assert.equal(updates.length, 1);
    assert.deepEqual(updates[0], {
      status: 'failed',
      error_message: '监测平台调用失败，请稍后重试'
    });
  } finally {
    QuestionRecord.create = originalCreateRecord;
    AIPlatformService.queryPlatform = originalQueryPlatform;
  }
});

test('summarizes project run results by completed and failed counts', () => {
  assert.deepEqual(ProjectRunService.summarizeRunResults([
    { status: 'completed' },
    { status: 'failed' }
  ], 2), {
    total: 2,
    completed: 1,
    failed: 1,
    message: '项目单次分析已完成，部分平台失败'
  });

  assert.deepEqual(ProjectRunService.summarizeRunResults([
    { status: 'failed' },
    { status: 'failed' }
  ], 2), {
    total: 2,
    completed: 0,
    failed: 2,
    message: '项目单次分析全部失败，请检查监测平台配置、账号额度或网络连接'
  });
});

test('project run response is not ok when every target fails', () => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../services/ProjectRunService.js'), 'utf8');

  assert.match(source, /const ok = summary\.completed > 0/);
  assert.match(source, /status: ok \? 200 : 502/);
  assert.match(source, /ok,/);
});

test('marks a project run target failed when AI returns an empty response body', async () => {
  const originalCreateRecord = QuestionRecord.create;
  const originalQueryPlatform = AIPlatformService.queryPlatform;
  const originalCreateDetail = ResultDetail.create;
  const originalFinalize = ProjectRunService.finalizeSuccessfulRecord;
  const updates = [];

  QuestionRecord.create = async () => ({
    id: 31,
    update: async (payload) => updates.push(payload)
  });
  AIPlatformService.queryPlatform = async () => ({
    success: true,
    data: { choices: [{ message: { content: '' } }] }
  });
  ResultDetail.create = async () => {
    throw new Error('should not create detail for empty response');
  };
  ProjectRunService.finalizeSuccessfulRecord = async () => {
    throw new Error('should not finalize empty response');
  };

  try {
    const result = await ProjectRunService.runTarget({
      target: {
        prompt: { id: 5, question: '静音轮胎怎么选' },
        platform: 'deepseek'
      },
      runUser: { id: 9 },
      projectData: { id: 2, name: '米其林' },
      competitors: [],
      keywords: ['米其林']
    });

    assert.deepEqual(result, {
      record_id: 31,
      prompt_id: 5,
      platform: 'deepseek',
      status: 'failed',
      error: '监测平台返回内容为空'
    });
    assert.equal(updates.length, 1);
    assert.equal(updates[0].status, 'failed');
    assert.equal(updates[0].error_message, '监测平台返回内容为空');
  } finally {
    QuestionRecord.create = originalCreateRecord;
    AIPlatformService.queryPlatform = originalQueryPlatform;
    ResultDetail.create = originalCreateDetail;
    ProjectRunService.finalizeSuccessfulRecord = originalFinalize;
  }
});

test('does not fail a completed project run when alert evaluation fails', async () => {
  const originalEvaluate = AlertEvaluationService.evaluateProject;
  const warnings = [];
  const originalWarn = console.warn;
  AlertEvaluationService.evaluateProject = async () => {
    throw new Error('alert database down');
  };
  console.warn = (...args) => warnings.push(args.join(' '));

  try {
    const result = await ProjectRunService.evaluateAlertsAfterRun(
      { id: 2 },
      { id: 9 }
    );

    assert.deepEqual(result, { ok: false, error: 'alert database down' });
    assert.equal(warnings.some((line) => line.includes('项目运行告警评估失败')), true);
  } finally {
    AlertEvaluationService.evaluateProject = originalEvaluate;
    console.warn = originalWarn;
  }
});

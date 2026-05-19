const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const {
  BrandProject,
  BrandCompetitor,
  DetectionSchedule,
  PromptGroup,
  TrackedPrompt,
  QuestionRecord,
  ResultDetail,
  VisibilityMetric,
  AlertRule,
  ReportSnapshot,
} = require('../models');
const ProjectMetricsService = require('../services/ProjectMetricsService');
const AIPlatformService = require('../services/AIPlatformService');
const ResultParserService = require('../services/ResultParserService');
const PromptSuggestionService = require('../services/PromptSuggestionService');
const ProjectRunService = require('../services/ProjectRunService');
const SourceAnalysisService = require('../services/SourceAnalysisService');
const OpportunityInsightService = require('../services/OpportunityInsightService');
const SchedulerService = require('../services/SchedulerService');
const TrackedPromptService = require('../services/TrackedPromptService');
const BrandCompetitorService = require('../services/BrandCompetitorService');
const BrandProjectService = require('../services/BrandProjectService');
const AlertEvaluationService = require('../services/AlertEvaluationService');
const ReportSnapshotService = require('../services/ReportSnapshotService');
const PlatformSelectionService = require('../services/PlatformSelectionService');
const PromptAnalysisCleanupService = require('../services/PromptAnalysisCleanupService');
const ProjectArchiveService = require('../services/ProjectArchiveService');
const ProjectLifecycleService = require('../services/ProjectLifecycleService');
const ProjectFieldNormalizationService = require('../services/ProjectFieldNormalizationService');

function asArray(value) {
  return ProjectFieldNormalizationService.normalizeList(value);
}

function cleanPlatforms(value) {
  return PlatformSelectionService.normalize(value);
}

function cleanMonitoringPayload(body, existing = {}, normalizedPlatforms = null) {
  const hasEnabled = body.monitoring_enabled !== undefined;
  const hasTime = body.monitoring_time !== undefined;
  if (!hasEnabled && !hasTime) return {};
  const normalized = SchedulerService.normalizeProjectMonitoring({
    monitoring_enabled: hasEnabled ? body.monitoring_enabled : existing.monitoring_enabled,
    monitoring_time: hasTime ? body.monitoring_time : existing.monitoring_time,
    platforms: body.platforms !== undefined ? (normalizedPlatforms || cleanPlatforms(body.platforms)) : existing.platforms
  });
  return {
    monitoring_enabled: normalized.monitoring_enabled,
    monitoring_time: normalized.monitoring_time,
    monitoring_next_run_at: normalized.monitoring_enabled ? SchedulerService.nextProjectRunAt(normalized.monitoring_time) : null
  };
}

function platformValidationError(res, result) {
  return res.status(400).json({
    success: false,
    message: result.message,
    data: { invalid_platforms: result.invalid_platforms }
  });
}

function alertValidationError(res, error) {
  if (error?.code !== 'INVALID_ALERT_RULE_TYPE') return null;
  return res.status(400).json({
    success: false,
    message: error.message
  });
}

function rejectInvalidWebsiteInput(req, res) {
  if (req.body?.website === undefined) return null;
  const raw = String(req.body.website || '').trim();
  if (!raw) return null;
  if (ProjectFieldNormalizationService.normalizeWebsite(raw)) return null;
  return res.status(400).json({ success: false, message: '官网格式不正确，请输入有效域名' });
}

function projectScopedUser(req) {
  const project = req.brandProject?.toJSON ? req.brandProject.toJSON() : req.brandProject;
  const projectOwnerId = Number(project?.user_id || 0);
  const userId = Number(req.user?.id || 0);
  if (projectOwnerId > 0 && req.user?.role === 'admin' && userId !== projectOwnerId) {
    return { ...req.user, id: projectOwnerId, actor_user_id: userId || null };
  }
  return req.user;
}

function rejectArchivedProjectMutation(req, res, message) {
  const guard = ProjectLifecycleService.validateActiveProject(req.brandProject, message);
  if (guard.ok) return null;
  return res.status(guard.status).json({ success: false, message: guard.message });
}

function canAccess(req, row) {
  return req.user.role === 'admin' || row.user_id === req.user.id;
}

async function normalizePromptGroupId(projectId, promptGroupId) {
  if (promptGroupId === undefined || promptGroupId === null || promptGroupId === '') return { value: null };
  const id = Number(promptGroupId);
  if (!Number.isInteger(id) || id <= 0) return { error: 'Prompt 分组 ID 无效' };
  const group = await PromptGroup.findOne({ where: { id, project_id: projectId } });
  if (!group) return { error: 'Prompt 分组不存在或不属于该品牌项目' };
  return { value: id };
}

async function loadProject(req, res, next) {
  try {
    const project = await BrandProject.findByPk(req.params.projectId || req.params.id);
    if (!project) return res.status(404).json({ success: false, message: '品牌项目不存在' });
    if (!canAccess(req, project)) return res.status(403).json({ success: false, message: '无权访问该品牌项目' });
    req.brandProject = project;
    return next();
  } catch (error) {
    return res.status(500).json({ success: false, message: '读取品牌项目失败' });
  }
}

async function batchDeletePrompts(req, res) {
  try {
    const archivedResponse = rejectArchivedProjectMutation(req, res, '归档项目不能修改 Prompt');
    if (archivedResponse) return archivedResponse;
    const ids = asArray(req.body.prompt_ids || req.body.ids)
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && item > 0);
    const uniqueIds = Array.from(new Set(ids));
    if (!uniqueIds.length) {
      return res.status(400).json({ success: false, message: '请选择需要删除的 Prompt' });
    }
    const matchedRows = await TrackedPrompt.findAll({
      where: {
        id: { [Op.in]: uniqueIds },
        project_id: req.brandProject.id
      },
      attributes: ['id'],
      raw: true
    });
    const matchedIds = matchedRows.map((item) => item.id);
    if (matchedIds.length) {
      await deletePromptAnalysisData(req.brandProject.id, matchedIds);
      await TrackedPrompt.destroy({
        where: {
          id: { [Op.in]: matchedIds },
          project_id: req.brandProject.id
        }
      });
    }
    return res.json({
      success: true,
      message: `已删除 ${matchedIds.length} 条 Prompt`,
      data: { deleted: matchedIds.length, requested: uniqueIds.length }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: '批量删除 Prompt 失败' });
  }
}

async function deletePromptAnalysisData(projectId, promptIds) {
  return PromptAnalysisCleanupService.deleteForPrompts(projectId, promptIds, {
    DetectionSchedule,
    QuestionRecord,
    VisibilityMetric,
    ResultDetail,
    ReportSnapshot
  });
}

async function deleteProjectAnalysisData(projectId) {
  return PromptAnalysisCleanupService.deleteForProject(projectId, {
    QuestionRecord,
    VisibilityMetric,
    ResultDetail,
    ReportSnapshot
  });
}

async function invalidateGeneratedReports(projectId) {
  return ReportSnapshot.destroy({
    where: {
      project_id: projectId,
      status: 'generated'
    }
  });
}

router.get('/', async (req, res) => {
  try {
    const where = req.user.role === 'admin' ? {} : { user_id: req.user.id };
    if (req.query.status) where.status = req.query.status;
    const rows = await BrandProject.findAll({
      where,
      include: [
        { model: BrandCompetitor, as: 'competitors' },
        { model: TrackedPrompt, as: 'trackedPrompts' }
      ],
      order: [['updated_at', 'DESC']]
    });
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取品牌项目失败' });
  }
});

router.post('/', async (req, res) => {
  try {
    const invalidWebsiteResponse = rejectInvalidWebsiteInput(req, res);
    if (invalidWebsiteResponse) return invalidWebsiteResponse;
    const projectFields = ProjectFieldNormalizationService.normalizeProjectPayload({
      name: req.body.name,
      aliases: req.body.aliases,
      website: req.body.website,
      industry: req.body.industry,
      primary_keywords: req.body.primary_keywords
    });
    if (!projectFields.name) return res.status(400).json({ success: false, message: '品牌名称不能为空' });
    const platformResult = PlatformSelectionService.validate(req.body.platforms);
    if (!platformResult.ok) return platformValidationError(res, platformResult);
    const duplicate = await BrandProjectService.findDuplicateProject(req.user.id, {
      name: projectFields.name,
      aliases: projectFields.aliases || []
    });
    if (duplicate) {
      return res.status(409).json({ success: false, message: '已存在相同品牌项目', data: { duplicate_id: duplicate.id } });
    }
    const websiteDuplicate = await BrandProjectService.findDuplicateProjectWebsite(req.user.id, {
      website: projectFields.website
    });
    if (websiteDuplicate) {
      return res.status(409).json({ success: false, message: '已存在相同品牌官网项目', data: { duplicate_id: websiteDuplicate.id } });
    }
    const project = await BrandProject.create({
      user_id: req.user.id,
      name: projectFields.name,
      aliases: projectFields.aliases || [],
      website: projectFields.website,
      industry: projectFields.industry,
      primary_keywords: projectFields.primary_keywords || [],
      platforms: platformResult.platforms,
      ...cleanMonitoringPayload(req.body, { monitoring_enabled: false, monitoring_time: '09:00', platforms: platformResult.platforms }, platformResult.platforms),
      status: req.body.status === 'archived' ? 'archived' : 'active'
    });
    res.json({ success: true, message: '品牌项目已创建', data: project });
  } catch (error) {
    res.status(500).json({ success: false, message: '创建品牌项目失败' });
  }
});

router.get('/:id', loadProject, async (req, res) => {
  try {
    const project = await BrandProject.findByPk(req.brandProject.id, {
      include: [
        { model: BrandCompetitor, as: 'competitors' },
        { model: PromptGroup, as: 'promptGroups' },
        { model: TrackedPrompt, as: 'trackedPrompts' },
        { model: AlertRule, as: 'alertRules' }
      ]
    });
    res.json({ success: true, data: project });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取品牌项目失败' });
  }
});

router.put('/:id', loadProject, async (req, res) => {
  try {
    const invalidWebsiteResponse = rejectInvalidWebsiteInput(req, res);
    if (invalidWebsiteResponse) return invalidWebsiteResponse;
    const lifecycleGuard = ProjectLifecycleService.validateProjectUpdate(req.brandProject, req.body || {});
    if (!lifecycleGuard.ok) {
      return res.status(lifecycleGuard.status).json({ success: false, message: lifecycleGuard.message });
    }
    const payload = {};
    if (req.body.name != null) {
      const name = ProjectFieldNormalizationService.normalizeNullableText(req.body.name) || '';
      if (!name) return res.status(400).json({ success: false, message: '品牌名称不能为空' });
      payload.name = name;
    }
    const candidateName = payload.name !== undefined ? payload.name : req.brandProject.name;
    if (req.body.aliases != null) {
      payload.aliases = ProjectFieldNormalizationService.normalizeList(req.body.aliases, { exclude: [candidateName] });
    }
    if (payload.name !== undefined || payload.aliases !== undefined) {
      const brandCandidate = {
        name: payload.name !== undefined ? payload.name : req.brandProject.name,
        aliases: payload.aliases !== undefined ? payload.aliases : req.brandProject.aliases
      };
      const duplicate = await BrandProjectService.findDuplicateProject(req.brandProject.user_id, brandCandidate, req.brandProject.id);
      if (duplicate) {
        return res.status(409).json({ success: false, message: '已存在相同品牌项目', data: { duplicate_id: duplicate.id } });
      }
      const competitorRows = await BrandCompetitor.findAll({
        where: { project_id: req.brandProject.id },
        attributes: ['id', 'name', 'aliases'],
        raw: true
      });
      const conflict = BrandCompetitorService.findBrandConflictInRows(brandCandidate, competitorRows);
      if (conflict) {
        return res.status(400).json({ success: false, message: '品牌名称或别名不能与已有竞品相同', data: { competitor_id: conflict.id } });
      }
    }
    if (req.body.website !== undefined) payload.website = ProjectFieldNormalizationService.normalizeWebsite(req.body.website);
    if (payload.website !== undefined) {
      const websiteDuplicate = await BrandProjectService.findDuplicateProjectWebsite(
        req.brandProject.user_id,
        { website: payload.website },
        req.brandProject.id
      );
      if (websiteDuplicate) {
        return res.status(409).json({ success: false, message: '已存在相同品牌官网项目', data: { duplicate_id: websiteDuplicate.id } });
      }
      const competitorRows = await BrandCompetitor.findAll({
        where: { project_id: req.brandProject.id },
        attributes: ['id', 'name', 'website'],
        raw: true
      });
      const websiteConflict = BrandCompetitorService.findBrandWebsiteConflictInRows({ website: payload.website }, competitorRows);
      if (websiteConflict) {
        return res.status(400).json({ success: false, message: '品牌官网不能与已有竞品官网相同', data: { competitor_id: websiteConflict.id } });
      }
    }
    if (req.body.industry !== undefined) payload.industry = ProjectFieldNormalizationService.normalizeNullableText(req.body.industry);
    if (req.body.primary_keywords != null) {
      payload.primary_keywords = ProjectFieldNormalizationService.normalizeList(req.body.primary_keywords, { exclude: [candidateName] });
    }
    let platformResult = null;
    if (req.body.platforms !== undefined) {
      platformResult = PlatformSelectionService.validate(req.body.platforms);
      if (!platformResult.ok) return platformValidationError(res, platformResult);
      payload.platforms = platformResult.platforms;
    }
    Object.assign(payload, cleanMonitoringPayload(req.body, req.brandProject.toJSON(), platformResult?.platforms));
    const archiveRequested = req.body.status === 'archived';
    const restoreRequested = req.body.status === 'active' && req.brandProject.status === 'archived';
    if (restoreRequested) {
      const duplicate = await BrandProjectService.findDuplicateProject(
        req.brandProject.user_id,
        { name: req.brandProject.name, aliases: req.brandProject.aliases },
        req.brandProject.id
      );
      if (duplicate) {
        return res.status(409).json({ success: false, message: '已存在相同品牌项目', data: { duplicate_id: duplicate.id } });
      }
      const websiteDuplicate = await BrandProjectService.findDuplicateProjectWebsite(
        req.brandProject.user_id,
        { website: req.brandProject.website },
        req.brandProject.id
      );
      if (websiteDuplicate) {
        return res.status(409).json({ success: false, message: '已存在相同品牌官网项目', data: { duplicate_id: websiteDuplicate.id } });
      }
    }
    if (req.body.status != null) payload.status = archiveRequested ? 'archived' : 'active';
    const projectAnalysisFieldsChanged = (
      (Object.prototype.hasOwnProperty.call(payload, 'name') && payload.name !== req.brandProject.name) ||
      (Object.prototype.hasOwnProperty.call(payload, 'aliases') && JSON.stringify(payload.aliases || []) !== JSON.stringify(asArray(req.brandProject.aliases))) ||
      (Object.prototype.hasOwnProperty.call(payload, 'website') && payload.website !== req.brandProject.website) ||
      (Object.prototype.hasOwnProperty.call(payload, 'industry') && payload.industry !== req.brandProject.industry) ||
      (Object.prototype.hasOwnProperty.call(payload, 'primary_keywords') && JSON.stringify(payload.primary_keywords || []) !== JSON.stringify(asArray(req.brandProject.primary_keywords))) ||
      (Object.prototype.hasOwnProperty.call(payload, 'platforms') && JSON.stringify(payload.platforms || []) !== JSON.stringify(cleanPlatforms(req.brandProject.platforms)))
    );
    await req.brandProject.update(payload);
    if (platformResult) {
      const promptRows = await TrackedPrompt.findAll({
        where: { project_id: req.brandProject.id },
        attributes: ['id', 'platforms']
      });
      await Promise.all(promptRows.map((prompt) => prompt.update({
        platforms: PlatformSelectionService.reconcilePromptPlatforms(prompt.platforms, platformResult.platforms)
      })));
    }
    if (archiveRequested) {
      await ProjectArchiveService.archiveProject(req.brandProject);
    }
    if (projectAnalysisFieldsChanged) await deleteProjectAnalysisData(req.brandProject.id);
    res.json({ success: true, message: '品牌项目已更新', data: req.brandProject });
  } catch (error) {
    res.status(500).json({ success: false, message: '更新品牌项目失败' });
  }
});

router.delete('/:id', loadProject, async (req, res) => {
  try {
    await ProjectArchiveService.archiveProject(req.brandProject);
    res.json({ success: true, message: '品牌项目已归档' });
  } catch (error) {
    res.status(500).json({ success: false, message: '归档品牌项目失败' });
  }
});

router.post('/:projectId/competitors', loadProject, async (req, res) => {
  try {
    const invalidWebsiteResponse = rejectInvalidWebsiteInput(req, res);
    if (invalidWebsiteResponse) return invalidWebsiteResponse;
    const archivedResponse = rejectArchivedProjectMutation(req, res, '归档项目不能修改竞品');
    if (archivedResponse) return archivedResponse;
    const name = ProjectFieldNormalizationService.normalizeNullableText(req.body.name) || '';
    if (!name) return res.status(400).json({ success: false, message: '竞品名称不能为空' });
    const aliases = ProjectFieldNormalizationService.normalizeList(req.body.aliases, { exclude: [name] });
    const website = ProjectFieldNormalizationService.normalizeWebsite(req.body.website);
    if (BrandCompetitorService.matchesBrand({ name, aliases }, req.brandProject.toJSON())) {
      return res.status(400).json({ success: false, message: '竞品不能与当前品牌名称或别名相同' });
    }
    if (BrandCompetitorService.matchesBrandWebsite({ website }, req.brandProject.toJSON())) {
      return res.status(400).json({ success: false, message: '竞品官网不能与当前品牌官网相同' });
    }
    const duplicate = await BrandCompetitorService.findDuplicateCompetitor(req.brandProject.id, { name, aliases });
    if (duplicate) {
      return res.status(409).json({ success: false, message: '该项目已存在相同竞品', data: { duplicate_id: duplicate.id } });
    }
    const websiteDuplicate = await BrandCompetitorService.findDuplicateCompetitorWebsite(req.brandProject.id, { website });
    if (websiteDuplicate) {
      return res.status(409).json({ success: false, message: '该项目已存在相同竞品官网', data: { duplicate_id: websiteDuplicate.id } });
    }
    const competitor = await BrandCompetitor.create({
      project_id: req.brandProject.id,
      user_id: projectScopedUser(req).id,
      name,
      aliases,
      website
    });
    await deleteProjectAnalysisData(req.brandProject.id);
    res.json({ success: true, message: '竞品已添加', data: competitor });
  } catch (error) {
    res.status(500).json({ success: false, message: '添加竞品失败' });
  }
});

router.put('/:projectId/competitors/:competitorId', loadProject, async (req, res) => {
  try {
    const invalidWebsiteResponse = rejectInvalidWebsiteInput(req, res);
    if (invalidWebsiteResponse) return invalidWebsiteResponse;
    const archivedResponse = rejectArchivedProjectMutation(req, res, '归档项目不能修改竞品');
    if (archivedResponse) return archivedResponse;
    const competitor = await BrandCompetitor.findOne({
      where: { id: req.params.competitorId, project_id: req.brandProject.id }
    });
    if (!competitor) return res.status(404).json({ success: false, message: '竞品不存在' });
    const payload = {};
    if (req.body.name != null) {
      const name = ProjectFieldNormalizationService.normalizeNullableText(req.body.name) || '';
      if (!name) return res.status(400).json({ success: false, message: '竞品名称不能为空' });
      payload.name = name;
    }
    const competitorName = payload.name !== undefined ? payload.name : competitor.name;
    if (req.body.aliases != null) {
      payload.aliases = ProjectFieldNormalizationService.normalizeList(req.body.aliases, { exclude: [competitorName] });
    }
    if (payload.name !== undefined || payload.aliases !== undefined) {
      const candidate = {
        name: payload.name !== undefined ? payload.name : competitor.name,
        aliases: payload.aliases !== undefined ? payload.aliases : competitor.aliases
      };
      if (BrandCompetitorService.matchesBrand(candidate, req.brandProject.toJSON())) {
        return res.status(400).json({ success: false, message: '竞品不能与当前品牌名称或别名相同' });
      }
      const duplicate = await BrandCompetitorService.findDuplicateCompetitor(req.brandProject.id, candidate, competitor.id);
      if (duplicate) {
        return res.status(409).json({ success: false, message: '该项目已存在相同竞品', data: { duplicate_id: duplicate.id } });
      }
    }
    if (req.body.website !== undefined) payload.website = ProjectFieldNormalizationService.normalizeWebsite(req.body.website);
    const candidateWebsite = payload.website !== undefined ? payload.website : competitor.website;
    if (BrandCompetitorService.matchesBrandWebsite({ website: candidateWebsite }, req.brandProject.toJSON())) {
      return res.status(400).json({ success: false, message: '竞品官网不能与当前品牌官网相同' });
    }
    const websiteDuplicate = await BrandCompetitorService.findDuplicateCompetitorWebsite(
      req.brandProject.id,
      { website: candidateWebsite },
      competitor.id
    );
    if (websiteDuplicate) {
      return res.status(409).json({ success: false, message: '该项目已存在相同竞品官网', data: { duplicate_id: websiteDuplicate.id } });
    }
    await competitor.update(payload);
    await deleteProjectAnalysisData(req.brandProject.id);
    res.json({ success: true, message: '竞品已更新', data: competitor });
  } catch (error) {
    res.status(500).json({ success: false, message: '更新竞品失败' });
  }
});

router.delete('/:projectId/competitors/:competitorId', loadProject, async (req, res) => {
  try {
    const archivedResponse = rejectArchivedProjectMutation(req, res, '归档项目不能修改竞品');
    if (archivedResponse) return archivedResponse;
    const deleted = await BrandCompetitor.destroy({ where: { id: req.params.competitorId, project_id: req.brandProject.id } });
    if (deleted) await deleteProjectAnalysisData(req.brandProject.id);
    res.json({ success: true, message: deleted ? '竞品已删除' : '竞品不存在' });
  } catch (error) {
    res.status(500).json({ success: false, message: '删除竞品失败' });
  }
});

router.post('/:projectId/prompt-groups', loadProject, async (req, res) => {
  try {
    const archivedResponse = rejectArchivedProjectMutation(req, res, '归档项目不能修改 Prompt 分组');
    if (archivedResponse) return archivedResponse;
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ success: false, message: '分组名称不能为空' });
    const group = await PromptGroup.create({
      project_id: req.brandProject.id,
      user_id: projectScopedUser(req).id,
      name,
      description: req.body.description ? String(req.body.description).trim() : null
    });
    res.json({ success: true, message: 'Prompt 分组已创建', data: group });
  } catch (error) {
    res.status(500).json({ success: false, message: '创建 Prompt 分组失败' });
  }
});

router.get('/:projectId/prompts', loadProject, async (req, res) => {
  try {
    const { periodStart, periodEnd } = ProjectMetricsService.buildPeriodWindow(req.query.days);
    const projectPlatforms = cleanPlatforms(req.brandProject.platforms);
    const [prompts, metrics, records] = await Promise.all([
      TrackedPrompt.findAll({
        where: { project_id: req.brandProject.id },
        include: [{ model: PromptGroup, as: 'group' }],
        order: [['updated_at', 'DESC']]
      }),
      VisibilityMetric.findAll({
        where: {
          project_id: req.brandProject.id,
          platform: { [Op.in]: projectPlatforms },
          created_at: { [Op.between]: [periodStart, periodEnd] }
        },
        order: [['created_at', 'ASC']]
      }),
      QuestionRecord.findAll({
        where: {
          project_id: req.brandProject.id,
          platform: { [Op.in]: projectPlatforms },
          tracked_prompt_id: { [Op.ne]: null },
          created_at: { [Op.between]: [periodStart, periodEnd] }
        },
        attributes: ['id', 'status', 'tracked_prompt_id', 'created_at'],
        order: [['created_at', 'ASC']]
      })
    ]);
    const promptRows = prompts.map((prompt) => {
      const row = prompt.toJSON();
      return {
        ...row,
        category: ProjectRunService.derivePromptCategory(row)
      };
    });
    const performance = ProjectMetricsService.buildPromptPerformance(
      promptRows,
      metrics.map((metric) => metric.toJSON()),
      records.map((record) => record.toJSON())
    );
    res.json({
      success: true,
      data: promptRows.map((prompt) => ({
        ...prompt,
        performance: performance[String(prompt.id)] || null
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取 Prompt 失败' });
  }
});

router.post('/:projectId/prompts/generate', loadProject, async (req, res) => {
  try {
    const archivedResponse = rejectArchivedProjectMutation(req, res, '归档项目不能生成 Prompt 建议');
    if (archivedResponse) return archivedResponse;
    const platform = 'deepseek';
    if (!AIPlatformService.platforms.deepseek?.apiKey) {
      return res.status(400).json({ success: false, message: 'Prompt 建议暂不可用，请联系管理员处理' });
    }

    const [competitors, existingPrompts] = await Promise.all([
      BrandCompetitor.findAll({
        where: { project_id: req.brandProject.id },
        order: [['id', 'ASC']]
      }),
      TrackedPrompt.findAll({
        where: { project_id: req.brandProject.id },
        attributes: ['question'],
        raw: true
      })
    ]);
    const requestedCount = PromptSuggestionService.normalizeCount(req.body.count || 10);
    const projectData = req.brandProject.toJSON();
    const competitorData = competitors.map((item) => item.toJSON());
    const generation = await PromptSuggestionService.generateSuggestions(projectData, competitorData, {
      platform,
      count: requestedCount,
      focus: req.body.focus,
      excludeQuestions: existingPrompts.map((item) => item.question).filter(Boolean),
      queryPlatform: (targetPlatform, question) => AIPlatformService.queryPlatform(targetPlatform, question),
      extractResponseText: (data) => ResultParserService.extractResponseText(data),
      maxBrandQuestionRatio: 0.15
    });
    if (!generation.success) {
      return res.status(502).json({ success: false, message: 'Prompt 建议生成失败，请稍后重试' });
    }

    const suggestions = generation.suggestions;
    if (!suggestions.length) {
      return res.status(502).json({ success: false, message: 'Prompt 建议暂不可用，请稍后重试' });
    }

    res.json({
      success: true,
      message: 'Prompt 建议已生成',
      data: {
        platform,
        requested_count: requestedCount,
        batch_count: generation.batch_count,
        suggestions
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '生成 Prompt 建议失败' });
  }
});

router.post('/:projectId/prompts', loadProject, async (req, res) => {
  try {
    const archivedResponse = rejectArchivedProjectMutation(req, res, '归档项目不能修改 Prompt');
    if (archivedResponse) return archivedResponse;
    const question = String(req.body.question || '').trim();
    if (!question) return res.status(400).json({ success: false, message: 'Prompt 问题不能为空' });
    const duplicate = await TrackedPromptService.findDuplicatePrompt(req.brandProject.id, question);
    if (duplicate) {
      return res.status(409).json({ success: false, message: '该项目已存在相同 Prompt', data: { duplicate_id: duplicate.id } });
    }
    const groupResult = await normalizePromptGroupId(req.brandProject.id, req.body.prompt_group_id);
    if (groupResult.error) return res.status(400).json({ success: false, message: groupResult.error });
    const platformResult = PlatformSelectionService.validateWithinProject(req.body.platforms, req.brandProject.platforms);
    if (!platformResult.ok) return platformValidationError(res, platformResult);
    const prompt = await TrackedPrompt.create({
      project_id: req.brandProject.id,
      prompt_group_id: groupResult.value,
      user_id: projectScopedUser(req).id,
      question,
      tags: asArray(req.body.tags),
      platforms: platformResult.platforms,
      enabled: req.body.enabled !== false
    });
    await invalidateGeneratedReports(req.brandProject.id);
    res.json({ success: true, message: 'Prompt 已创建', data: prompt });
  } catch (error) {
    res.status(500).json({ success: false, message: '创建 Prompt 失败' });
  }
});

router.put('/:projectId/prompts/:promptId', loadProject, async (req, res) => {
  try {
    const archivedResponse = rejectArchivedProjectMutation(req, res, '归档项目不能修改 Prompt');
    if (archivedResponse) return archivedResponse;
    const prompt = await TrackedPrompt.findOne({ where: { id: req.params.promptId, project_id: req.brandProject.id } });
    if (!prompt) return res.status(404).json({ success: false, message: 'Prompt 不存在' });
    const payload = {};
    if (req.body.question != null) {
      const question = String(req.body.question || '').trim();
      if (!question) return res.status(400).json({ success: false, message: 'Prompt 问题不能为空' });
      const duplicate = await TrackedPromptService.findDuplicatePrompt(req.brandProject.id, question, prompt.id);
      if (duplicate) {
        return res.status(409).json({ success: false, message: '该项目已存在相同 Prompt', data: { duplicate_id: duplicate.id } });
      }
      payload.question = question;
    }
    if (req.body.prompt_group_id !== undefined) {
      const groupResult = await normalizePromptGroupId(req.brandProject.id, req.body.prompt_group_id);
      if (groupResult.error) return res.status(400).json({ success: false, message: groupResult.error });
      payload.prompt_group_id = groupResult.value;
    }
    if (req.body.tags != null) payload.tags = asArray(req.body.tags);
    if (req.body.platforms !== undefined) {
      const platformResult = PlatformSelectionService.validateWithinProject(req.body.platforms, req.brandProject.platforms);
      if (!platformResult.ok) return platformValidationError(res, platformResult);
      payload.platforms = platformResult.platforms;
    }
    if (req.body.enabled != null) payload.enabled = !!req.body.enabled;
    const analysisFieldsChanged = (
      (Object.prototype.hasOwnProperty.call(payload, 'question') && payload.question !== prompt.question) ||
      (Object.prototype.hasOwnProperty.call(payload, 'tags') && JSON.stringify(payload.tags || []) !== JSON.stringify(asArray(prompt.tags))) ||
      (Object.prototype.hasOwnProperty.call(payload, 'platforms') && JSON.stringify(payload.platforms || []) !== JSON.stringify(cleanPlatforms(prompt.platforms)))
    );
    const promptVisibilityChanged = Object.prototype.hasOwnProperty.call(payload, 'enabled') && payload.enabled !== prompt.enabled;
    await prompt.update(payload);
    if (analysisFieldsChanged) await deletePromptAnalysisData(req.brandProject.id, [prompt.id]);
    else if (promptVisibilityChanged) await invalidateGeneratedReports(req.brandProject.id);
    res.json({ success: true, message: 'Prompt 已更新', data: prompt });
  } catch (error) {
    res.status(500).json({ success: false, message: '更新 Prompt 失败' });
  }
});

router.post('/:projectId/prompts/batch-delete', loadProject, batchDeletePrompts);
router.delete('/:projectId/prompts/batch', loadProject, batchDeletePrompts);

router.delete('/:projectId/prompts/:promptId', loadProject, async (req, res) => {
  try {
    const archivedResponse = rejectArchivedProjectMutation(req, res, '归档项目不能修改 Prompt');
    if (archivedResponse) return archivedResponse;
    const promptId = Number(req.params.promptId);
    if (!Number.isInteger(promptId) || promptId <= 0) {
      return res.status(400).json({ success: false, message: 'Prompt ID 无效' });
    }
    await deletePromptAnalysisData(req.brandProject.id, [promptId]);
    const deleted = await TrackedPrompt.destroy({ where: { id: promptId, project_id: req.brandProject.id } });
    res.json({ success: true, message: deleted ? 'Prompt 已删除' : 'Prompt 不存在' });
  } catch (error) {
    res.status(500).json({ success: false, message: '删除 Prompt 失败' });
  }
});

router.post('/:projectId/run', loadProject, async (req, res) => {
  try {
    if (!ProjectRunService.isRunnableProject(req.brandProject.toJSON())) {
      return res.status(400).json({ success: false, message: '归档项目不能运行分析' });
    }
    const where = { project_id: req.brandProject.id, enabled: true };
    const promptSelection = ProjectRunService.normalizeRunPromptIds(req.body.prompt_ids);
    if (promptSelection.explicit && !promptSelection.ids.length) {
      return res.status(400).json({ success: false, message: '请选择需要运行的 Prompt' });
    }
    if (promptSelection.ids.length) where.id = { [Op.in]: promptSelection.ids };

    const prompts = await TrackedPrompt.findAll({ where, order: [['updated_at', 'DESC']] });
    if (promptSelection.explicit && prompts.length !== promptSelection.ids.length) {
      return res.status(400).json({ success: false, message: '选择的 Prompt 不存在或已停用' });
    }
    const result = await ProjectRunService.runProject({
      project: req.brandProject,
      prompts: prompts.map((item) => item.toJSON()),
      platforms: cleanPlatforms(req.brandProject.platforms),
      user: req.user,
      promptSelectionExplicit: promptSelection.explicit
    });
    if (!result.ok) {
      return res.status(result.status || 400).json({ success: false, message: result.message, data: result.data });
    }
    return res.json({ success: true, message: result.message, data: result.data });
  } catch (error) {
    return res.status(500).json({ success: false, message: '运行项目分析失败' });
  }
});

router.post('/:projectId/prompts/:promptId/run', loadProject, async (req, res) => {
  try {
    if (!ProjectRunService.isRunnableProject(req.brandProject.toJSON())) {
      return res.status(400).json({ success: false, message: '归档项目不能运行分析' });
    }
    const prompt = await TrackedPrompt.findOne({
      where: { id: req.params.promptId, project_id: req.brandProject.id, enabled: true }
    });
    if (!prompt) return res.status(404).json({ success: false, message: 'Prompt 不存在或已停用' });
    const result = await ProjectRunService.runProject({
      project: req.brandProject,
      prompts: [prompt.toJSON()],
      platforms: cleanPlatforms(req.brandProject.platforms),
      user: req.user
    });
    if (!result.ok) {
      return res.status(result.status || 400).json({ success: false, message: result.message, data: result.data });
    }
    return res.json({ success: true, message: result.message, data: result.data });
  } catch (error) {
    return res.status(500).json({ success: false, message: '运行 Prompt 分析失败' });
  }
});

router.get('/:projectId/prompts/:promptId/history', loadProject, async (req, res) => {
  try {
    const prompt = await TrackedPrompt.findOne({ where: { id: req.params.promptId, project_id: req.brandProject.id } });
    if (!prompt) return res.status(404).json({ success: false, message: 'Prompt 不存在' });
    const limit = Math.max(1, Math.min(100, Number(req.query.limit || 20)));
    const projectPlatforms = cleanPlatforms(req.brandProject.platforms);
    const rows = await QuestionRecord.findAll({
      where: {
        project_id: req.brandProject.id,
        platform: { [Op.in]: projectPlatforms },
        tracked_prompt_id: prompt.id
      },
      include: [
        { model: ResultDetail, as: 'resultDetail' },
        { model: VisibilityMetric, as: 'visibilityMetric' }
      ],
      order: [['created_at', 'DESC']],
      limit
    });
    return res.json({ success: true, data: rows });
  } catch (error) {
    return res.status(500).json({ success: false, message: '获取 Prompt 历史失败' });
  }
});

router.get('/:projectId/dashboard', loadProject, async (req, res) => {
  try {
    const { days, periodStart, periodEnd, changePeriodStart } = ProjectMetricsService.buildPeriodWindow(req.query.days);
    const projectPlatforms = cleanPlatforms(req.brandProject.platforms);
    const [metrics, sourceChangeMetrics, records, prompts, competitors] = await Promise.all([
      VisibilityMetric.findAll({
        where: {
          project_id: req.brandProject.id,
          platform: { [Op.in]: projectPlatforms },
          created_at: { [Op.between]: [periodStart, periodEnd] }
        },
        include: [
          { model: QuestionRecord, as: 'questionRecord', attributes: ['id', 'question'] },
          { model: TrackedPrompt, as: 'prompt', attributes: ['id', 'question'] }
        ],
        order: [['created_at', 'ASC']]
      }),
      VisibilityMetric.findAll({
        where: {
          project_id: req.brandProject.id,
          platform: { [Op.in]: projectPlatforms },
          created_at: { [Op.between]: [changePeriodStart, periodEnd] }
        },
        order: [['created_at', 'ASC']]
      }),
      QuestionRecord.findAll({
        where: {
          project_id: req.brandProject.id,
          platform: { [Op.in]: projectPlatforms },
          created_at: { [Op.between]: [periodStart, periodEnd] }
        },
        attributes: ['id', 'status', 'tracked_prompt_id', 'created_at'],
        raw: true
      }),
      TrackedPrompt.findAll({
        where: { project_id: req.brandProject.id },
        attributes: ['id', 'question', 'tags', 'platforms', 'enabled'],
        raw: true
      }),
      BrandCompetitor.findAll({
        where: { project_id: req.brandProject.id },
        order: [['id', 'ASC']]
      })
    ]);
    const plain = metrics.map((row) => row.toJSON());
    const sourceChangeRows = sourceChangeMetrics.map((row) => row.toJSON());
    const promptRows = prompts.map((prompt) => ({
      ...prompt,
      category: ProjectRunService.derivePromptCategory(prompt)
    }));
    const promptPerformance = ProjectMetricsService.buildPromptPerformance(promptRows, plain, records);
    const sourceAnalysis = SourceAnalysisService.summarize(plain, {
      brand: req.brandProject.toJSON(),
      competitors: competitors.map((row) => row.toJSON()),
      prompts: promptRows,
      days,
      referenceDate: periodEnd,
      changeMetrics: sourceChangeRows
    });
    const opportunities = OpportunityInsightService.build({
      prompts: promptRows,
      promptPerformance,
      metrics: plain,
      sourceOpportunities: sourceAnalysis.opportunities,
      projectPlatforms,
      days
    });
    const summary = ProjectMetricsService.buildDashboardSummary({
      metrics: plain,
      records,
      prompts: promptRows,
      sourceAnalysis
    });
    res.json({
      success: true,
      data: {
        project: req.brandProject,
        summary,
        trend: ProjectMetricsService.buildTrend(plain, days, { referenceDate: periodEnd }),
        opportunities,
        recent_metrics: plain.slice(-20).reverse()
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取项目看板失败' });
  }
});

router.get('/:projectId/sources', loadProject, async (req, res) => {
  try {
    const { days, periodStart, periodEnd, changePeriodStart } = ProjectMetricsService.buildPeriodWindow(req.query.days);
    const projectPlatforms = cleanPlatforms(req.brandProject.platforms);
    const [metrics, changeMetrics, competitors, prompts] = await Promise.all([
      VisibilityMetric.findAll({
        where: {
          project_id: req.brandProject.id,
          platform: { [Op.in]: projectPlatforms },
          created_at: { [Op.between]: [periodStart, periodEnd] }
        },
        order: [['created_at', 'ASC']]
      }),
      VisibilityMetric.findAll({
        where: {
          project_id: req.brandProject.id,
          platform: { [Op.in]: projectPlatforms },
          created_at: { [Op.between]: [changePeriodStart, periodEnd] }
        },
        order: [['created_at', 'ASC']]
      }),
      BrandCompetitor.findAll({
        where: { project_id: req.brandProject.id },
        order: [['id', 'ASC']]
      }),
      TrackedPrompt.findAll({
        where: { project_id: req.brandProject.id },
        attributes: ['id', 'question', 'tags', 'platforms', 'enabled'],
        raw: true
      })
    ]);
    const plain = metrics.map((row) => row.toJSON());
    const changeRows = changeMetrics.map((row) => row.toJSON());
    const competitorRows = competitors.map((row) => row.toJSON());
    const analysis = SourceAnalysisService.summarize(plain, {
      brand: req.brandProject.toJSON(),
      competitors: competitorRows,
      prompts,
      days,
      referenceDate: periodEnd,
      changeMetrics: changeRows
    });

    res.json({
      success: true,
      data: {
        project: req.brandProject,
        days,
        ...analysis
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取来源分析失败' });
  }
});

router.get('/:projectId/reports/latest', loadProject, async (req, res) => {
  try {
    const report = await ReportSnapshotService.findLatest({
      project: req.brandProject,
      days: req.query.days
    });
    res.json({ success: true, data: report });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取最新报告失败' });
  }
});

router.post('/:projectId/reports/generate', loadProject, async (req, res) => {
  try {
    const archivedResponse = rejectArchivedProjectMutation(req, res, '归档项目不能生成报告');
    if (archivedResponse) return archivedResponse;
    const report = await ReportSnapshotService.generate({
      project: req.brandProject,
      user: req.user,
      days: req.body.days
    });
    res.json({ success: true, message: '报告快照已生成', data: report });
  } catch (error) {
    res.status(500).json({ success: false, message: '生成报告失败' });
  }
});

router.get('/:projectId/alerts', loadProject, async (req, res) => {
  try {
    const rows = await AlertRule.findAll({ where: { project_id: req.brandProject.id }, order: [['id', 'DESC']] });
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: '获取告警规则失败' });
  }
});

router.post('/:projectId/alerts', loadProject, async (req, res) => {
  try {
    const archivedResponse = rejectArchivedProjectMutation(req, res, '归档项目不能修改告警规则');
    if (archivedResponse) return archivedResponse;
    const payload = AlertEvaluationService.buildRulePayload(req.body, 'visibility_drop');
    const type = payload.type || 'visibility_drop';
    const threshold = payload.threshold ?? AlertEvaluationService.normalizeThreshold(type, req.body.threshold);
    const rule = await AlertRule.create({
      project_id: req.brandProject.id,
      user_id: projectScopedUser(req).id,
      type,
      threshold,
      enabled: payload.enabled !== false
    });
    res.json({ success: true, message: '告警规则已创建', data: rule });
  } catch (error) {
    const validationResponse = alertValidationError(res, error);
    if (validationResponse) return validationResponse;
    res.status(500).json({ success: false, message: '创建告警规则失败' });
  }
});

router.put('/:projectId/alerts/:alertId', loadProject, async (req, res) => {
  try {
    const archivedResponse = rejectArchivedProjectMutation(req, res, '归档项目不能修改告警规则');
    if (archivedResponse) return archivedResponse;
    const rule = await AlertRule.findOne({ where: { id: req.params.alertId, project_id: req.brandProject.id } });
    if (!rule) return res.status(404).json({ success: false, message: '告警规则不存在' });
    const payload = AlertEvaluationService.buildRulePayload(req.body, rule.type);
    await rule.update(payload);
    res.json({ success: true, message: '告警规则已更新', data: rule });
  } catch (error) {
    const validationResponse = alertValidationError(res, error);
    if (validationResponse) return validationResponse;
    res.status(500).json({ success: false, message: '更新告警规则失败' });
  }
});

router.delete('/:projectId/alerts/:alertId', loadProject, async (req, res) => {
  try {
    const archivedResponse = rejectArchivedProjectMutation(req, res, '归档项目不能修改告警规则');
    if (archivedResponse) return archivedResponse;
    const deleted = await AlertRule.destroy({ where: { id: req.params.alertId, project_id: req.brandProject.id } });
    res.json({ success: true, message: deleted ? '告警规则已删除' : '告警规则不存在' });
  } catch (error) {
    res.status(500).json({ success: false, message: '删除告警规则失败' });
  }
});

module.exports = router;

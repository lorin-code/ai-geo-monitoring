const { BrandProject, TrackedPrompt } = require('../models');
const PlatformSelectionService = require('./PlatformSelectionService');

function normalizeOptionalId(value) {
  if (value === undefined || value === null || value === '') return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : NaN;
}

async function resolveProjectContext({ user, source, repositories = {}, messages = {} }) {
  const ProjectRepository = repositories.BrandProject || BrandProject;
  const PromptRepository = repositories.TrackedPrompt || TrackedPrompt;

  const projectId = normalizeOptionalId(source.project_id);
  const promptId = normalizeOptionalId(source.tracked_prompt_id ?? source.prompt_id);
  if (Number.isNaN(projectId) || Number.isNaN(promptId)) {
    return { error: { status: 400, message: messages.invalidIds || '项目或 Prompt ID 无效' } };
  }
  if (!projectId && promptId) {
    return { error: { status: 400, message: messages.promptRequiresProject || '使用 Prompt 创建定时任务时必须提供 project_id' } };
  }
  if (!projectId) {
    return {
      project_id: null,
      tracked_prompt_id: null,
      user_id: user.id
    };
  }

  const project = await ProjectRepository.findByPk(projectId);
  if (!project) return { error: { status: 404, message: messages.projectNotFound || '品牌项目不存在' } };
  if (user.role !== 'admin' && project.user_id !== user.id) {
    return { error: { status: 403, message: messages.forbidden || '无权访问该品牌项目' } };
  }
  const projectData = project.toJSON ? project.toJSON() : project;
  if (projectData.status === 'archived') {
    return { error: { status: 400, message: messages.archivedProject || '归档项目不能创建或更新定时任务' } };
  }

  let promptData = null;
  if (promptId) {
    const prompt = await PromptRepository.findOne({ where: { id: promptId, project_id: project.id } });
    if (!prompt) return { error: { status: 404, message: messages.promptNotFound || 'Prompt 不存在或不属于该品牌项目' } };
    promptData = prompt.toJSON ? prompt.toJSON() : prompt;
    if (promptData.enabled === false) {
      return { error: { status: 400, message: messages.disabledPrompt || '停用 Prompt 不能创建或更新定时任务' } };
    }
  }

  const ownerId = Number(project.user_id || 0) || user.id;
  const projectPlatforms = PlatformSelectionService.normalize(projectData.platforms);
  const promptPlatforms = promptData
    ? PlatformSelectionService.reconcilePromptPlatforms(promptData.platforms, projectPlatforms)
    : [];
  return {
    project_id: project.id,
    tracked_prompt_id: promptId || null,
    user_id: ownerId,
    project_platforms: projectPlatforms,
    prompt_platforms: promptPlatforms,
    allowed_platforms: promptPlatforms.length ? promptPlatforms : projectPlatforms,
    ...(user.role === 'admin' && user.id !== ownerId ? { actor_user_id: user.id } : {})
  };
}

function validatePlatformsWithinContext(platforms, projectContext, message = '监测平台必须包含在项目或 Prompt 的监测平台内') {
  const result = PlatformSelectionService.validate(platforms);
  if (!result.ok) return result;
  if (!projectContext?.project_id) return result;
  const scoped = PlatformSelectionService.validateWithinProject(result.platforms, projectContext.allowed_platforms);
  if (!scoped.ok) return { ...scoped, message };
  return scoped;
}

function defaultPlatformsForContext(availablePlatforms, projectContext) {
  const result = PlatformSelectionService.validate(availablePlatforms);
  const mainlandAvailable = result.ok ? result.platforms : [];
  if (!projectContext?.project_id) return mainlandAvailable;
  const allowed = new Set(PlatformSelectionService.normalize(projectContext.allowed_platforms));
  return mainlandAvailable.filter((platform) => allowed.has(platform));
}

function canOperateSchedule(schedule, user) {
  return user.role === 'admin' || schedule.user_id === user.id;
}

module.exports = {
  normalizeOptionalId,
  resolveProjectContext,
  validatePlatformsWithinContext,
  defaultPlatformsForContext,
  canOperateSchedule
};

const { MONITORING_PLATFORMS: MAINLAND_PLATFORMS } = require('./monitoringPlatforms.cjs');

function normalizePlatforms(value, fallback = []) {
  const rows = Array.isArray(value) ? value : [];
  const list = rows
    .map((item) => String(item || '').trim().toLowerCase())
    .filter((item) => MAINLAND_PLATFORMS.includes(item));
  return list.length ? Array.from(new Set(list)) : fallback;
}

function promptCanRunOnProject(prompt, projectPlatforms) {
  if (!prompt || prompt.enabled === false) return false;
  const promptPlatforms = normalizePlatforms(prompt.platforms, projectPlatforms);
  return promptPlatforms.some((item) => projectPlatforms.includes(item));
}

function getRunnableProjectPromptIds(prompts, projectPlatformValue) {
  const rows = Array.isArray(prompts) ? prompts : [];
  const projectPlatforms = normalizePlatforms(projectPlatformValue, MAINLAND_PLATFORMS);
  return rows
    .filter((item) => promptCanRunOnProject(item, projectPlatforms))
    .map((item) => item.id)
    .filter(Boolean);
}

function getProjectPromptRunBlockReason(prompts, projectPlatformValue) {
  const rows = Array.isArray(prompts) ? prompts : [];
  const enabledPrompts = rows.filter((item) => item?.enabled !== false);
  if (!enabledPrompts.length) return 'no_enabled_prompt';
  const projectPlatforms = normalizePlatforms(projectPlatformValue, MAINLAND_PLATFORMS);
  const hasRunnablePrompt = enabledPrompts.some((item) => promptCanRunOnProject(item, projectPlatforms));
  return hasRunnablePrompt ? null : 'platform_mismatch';
}

function summarizeProjectPrompts(prompts, projectPlatformValue) {
  const rows = Array.isArray(prompts) ? prompts : [];
  const enabled = rows.filter((item) => item?.enabled !== false).length;
  const projectPlatforms = normalizePlatforms(projectPlatformValue, MAINLAND_PLATFORMS);
  return {
    enabled,
    total: rows.length,
    runnable: rows.some((item) => promptCanRunOnProject(item, projectPlatforms))
  };
}

module.exports = {
  getProjectPromptRunBlockReason,
  getRunnableProjectPromptIds,
  summarizeProjectPrompts
};

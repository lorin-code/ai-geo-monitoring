const PLATFORM_LABELS = {
  doubao: '豆包',
  deepseek: 'DeepSeek', qianwen: '千问', kimi: 'Kimi',
};

const { MONITORING_PLATFORMS: DEFAULT_PROJECT_PLATFORMS } = require('./monitoringPlatforms.cjs');

function normalizeList(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
}

function normalizePromptPlatforms(promptPlatforms, projectPlatforms = DEFAULT_PROJECT_PLATFORMS) {
  const projectList = normalizeList(projectPlatforms).filter((item) => DEFAULT_PROJECT_PLATFORMS.includes(item));
  const fallback = projectList.length ? projectList : DEFAULT_PROJECT_PLATFORMS;
  const promptList = normalizeList(promptPlatforms).filter((item) => DEFAULT_PROJECT_PLATFORMS.includes(item));
  return promptList.length ? promptList : fallback;
}

function filterPromptRows(prompts, options = {}) {
  const rows = Array.isArray(prompts) ? prompts : [];
  const keyword = String(options.search || '').trim().toLowerCase();
  const status = options.status || 'all';
  const platform = options.platform || 'all';
  const category = options.category || 'all';
  const projectPlatforms = normalizeList(options.projectPlatforms);

  return rows.filter((item) => {
    const enabled = item?.enabled !== false;
    if (status === 'enabled' && !enabled) return false;
    if (status === 'disabled' && enabled) return false;

    const platforms = normalizePromptPlatforms(item?.platforms, projectPlatforms);
    if (platform !== 'all' && !platforms.includes(platform)) return false;

    const categoryText = String(item?.category || item?.prompt_category || '').trim();
    if (category !== 'all' && categoryText !== category) return false;

    if (!keyword) return true;
    const tagsText = normalizeList(item?.tags).join(' ');
    const platformText = platforms
      .flatMap((value) => [value, PLATFORM_LABELS[value]])
      .filter(Boolean)
      .join(' ');
    const statusText = enabled ? '启用中 enabled' : '已停用 disabled';
    return `${item?.question || ''} ${categoryText} ${tagsText} ${platformText} ${statusText}`.toLowerCase().includes(keyword);
  });
}

module.exports = {
  PLATFORM_LABELS,
  DEFAULT_PROJECT_PLATFORMS,
  normalizePromptPlatforms,
  filterPromptRows,
};

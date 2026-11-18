const PLATFORM_LABELS = { doubao: '豆包', deepseek: 'DeepSeek', qianwen: '千问', kimi: 'Kimi' };

function resolveMonitoringPlatforms(value) {
  if (value === undefined || String(value).trim() === '') return Object.keys(PLATFORM_LABELS);
  const platforms = Array.from(new Set(String(value).split(',')
    .map((item) => item.trim().toLowerCase()).filter(Boolean)));
  if (!platforms.length || platforms.some((item) => !Object.hasOwn(PLATFORM_LABELS, item))) {
    throw new Error('NEXT_PUBLIC_MONITORING_PLATFORMS must contain doubao, deepseek, qianwen and/or kimi');
  }
  return platforms;
}

// Supported labels are stable; actual availability is fetched for the signed-in user.
const MONITORING_PLATFORMS = resolveMonitoringPlatforms();
const MONITORING_PLATFORM_OPTIONS = MONITORING_PLATFORMS.map((value) => ({
  value,
  label: PLATFORM_LABELS[value],
}));
const MONITORING_PLATFORM_NAMES = MONITORING_PLATFORM_OPTIONS.map((item) => item.label).join('、');

module.exports = {
  MONITORING_PLATFORMS,
  MONITORING_PLATFORM_OPTIONS,
  MONITORING_PLATFORM_NAMES,
  resolveMonitoringPlatforms,
};

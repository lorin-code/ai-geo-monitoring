const KNOWN_PLATFORMS = ['doubao', 'deepseek', 'qianwen', 'kimi'];

function getMonitoringPlatforms(value = process.env.MONITORING_PLATFORMS) {
  if (value === undefined || String(value).trim() === '') return [...KNOWN_PLATFORMS];

  const platforms = Array.from(new Set(String(value).split(',')
    .map((item) => item.trim().toLowerCase()).filter(Boolean)));
  if (!platforms.length || platforms.some((item) => !KNOWN_PLATFORMS.includes(item))) {
    throw new Error('MONITORING_PLATFORMS must contain doubao, deepseek, qianwen and/or kimi');
  }
  return platforms;
}

module.exports = { getMonitoringPlatforms };

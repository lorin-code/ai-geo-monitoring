const MAINLAND_PLATFORMS = ['doubao', 'deepseek'];
const PLATFORM_LABELS = {
  doubao: '豆包',
  deepseek: 'DeepSeek'
};

function asArray(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(/[,，;\n]/).map((item) => item.trim()).filter(Boolean);
  return [];
}

class PlatformSelectionService {
  getSupportedPlatforms() {
    return [...MAINLAND_PLATFORMS];
  }

  normalize(value) {
    const result = this.validate(value);
    return result.ok ? result.platforms : MAINLAND_PLATFORMS;
  }

  validateWithinProject(value, projectPlatforms) {
    const projectResult = this.validate(projectPlatforms);
    const allowedPlatforms = projectResult.ok && projectResult.platforms.length
      ? projectResult.platforms
      : [...MAINLAND_PLATFORMS];
    const raw = asArray(value);
    const result = this.validate(raw.length ? raw : allowedPlatforms);
    if (!result.ok) return result;

    const allowed = new Set(allowedPlatforms);
    const invalid = result.platforms.filter((item) => !allowed.has(item));
    if (invalid.length) {
      return {
        ok: false,
        platforms: [],
        invalid_platforms: invalid,
        message: `Prompt 监测平台必须包含在项目监测平台内：${allowedPlatforms.map((item) => PLATFORM_LABELS[item]).join('、')}`
      };
    }

    return result;
  }

  reconcilePromptPlatforms(promptPlatforms, projectPlatforms) {
    const projectResult = this.validate(projectPlatforms);
    const allowedPlatforms = projectResult.ok && projectResult.platforms.length
      ? projectResult.platforms
      : [...MAINLAND_PLATFORMS];
    const allowed = new Set(allowedPlatforms);
    const retained = Array.from(new Set(asArray(promptPlatforms).map((item) => item.toLowerCase())))
      .filter((item) => MAINLAND_PLATFORMS.includes(item) && allowed.has(item));
    return retained.length ? retained : allowedPlatforms;
  }

  validate(value) {
    const raw = asArray(value).map((item) => item.toLowerCase());
    if (!raw.length) {
      return { ok: true, platforms: [...MAINLAND_PLATFORMS], invalid_platforms: [] };
    }

    const unique = Array.from(new Set(raw));
    const invalid = unique.filter((item) => !MAINLAND_PLATFORMS.includes(item));
    if (invalid.length) {
      return {
        ok: false,
        platforms: [],
        invalid_platforms: invalid,
        message: `监测平台仅支持${MAINLAND_PLATFORMS.map((item) => PLATFORM_LABELS[item]).join('、')}`
      };
    }

    return { ok: true, platforms: unique, invalid_platforms: [] };
  }

  buildSupportedStatus(platformConfigs = {}) {
    return MAINLAND_PLATFORMS.map((key) => {
      const cfg = platformConfigs[key] || {};
      const ok = Boolean(cfg.apiKey);
      return {
        platform: key,
        name: cfg.name || PLATFORM_LABELS[key] || key,
        apiUrl: cfg.apiUrl,
        ok,
        message: ok ? '平台服务凭证已配置' : '平台服务凭证未配置'
      };
    });
  }
}

module.exports = new PlatformSelectionService();

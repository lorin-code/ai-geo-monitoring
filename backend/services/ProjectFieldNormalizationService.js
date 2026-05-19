function splitListValue(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return value.split(/[,，;；\n]/);
  return [];
}

const CitationAnalysisService = require('./CitationAnalysisService');

function normalizeText(value) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  return text || null;
}

function canonicalValue(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

class ProjectFieldNormalizationService {
  normalizeList(value, options = {}) {
    const exclude = new Set((Array.isArray(options.exclude) ? options.exclude : [])
      .map((item) => canonicalValue(item))
      .filter(Boolean));
    const seen = new Set();
    const result = [];

    splitListValue(value).forEach((item) => {
      const text = normalizeText(item);
      if (!text) return;
      const key = canonicalValue(text);
      if (!key || exclude.has(key) || seen.has(key)) return;
      seen.add(key);
      result.push(text);
    });

    return result;
  }

  normalizeNullableText(value) {
    return normalizeText(value);
  }

  normalizeWebsite(value) {
    const text = normalizeText(value);
    if (!text) return null;
    try {
      const raw = /^https?:\/\//i.test(text) ? text : `https://${text}`;
      const parsed = new URL(raw);
      parsed.protocol = 'https:';
      parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
      if (!CitationAnalysisService.isValidDomain(parsed.hostname)) return null;
      parsed.pathname = '';
      parsed.search = '';
      parsed.hash = '';
      return parsed.toString().replace(/\/$/, '');
    } catch (_) {
      return null;
    }
  }

  normalizeProjectPayload(body = {}) {
    const payload = {};
    if (body.name !== undefined) payload.name = normalizeText(body.name) || '';
    if (body.aliases !== undefined) payload.aliases = this.normalizeList(body.aliases, { exclude: [payload.name] });
    if (body.website !== undefined) payload.website = this.normalizeWebsite(body.website);
    if (body.industry !== undefined) payload.industry = this.normalizeNullableText(body.industry);
    if (body.primary_keywords !== undefined) {
      payload.primary_keywords = this.normalizeList(body.primary_keywords, { exclude: [payload.name] });
    }
    return payload;
  }
}

module.exports = new ProjectFieldNormalizationService();

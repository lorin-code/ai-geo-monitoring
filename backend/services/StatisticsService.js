class StatisticsService {
  parseBrandKeywords(value) {
    const rawKeywords = Array.isArray(value)
      ? value
      : String(value || '').split(/[,，]/);

    const seen = new Set();
    return rawKeywords
      .map(keyword => String(keyword || '').trim())
      .filter(keyword => {
        if (!keyword) return false;
        const key = keyword.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  parseStoredKeywordCounts(record, allowedKeywords) {
    let summary = record?.result_summary;
    if (typeof summary === 'string') {
      try {
        summary = JSON.parse(summary);
      } catch (_) {
        summary = null;
      }
    }
    const counts = summary?.keyword_counts;
    if (!Array.isArray(counts) || !counts.length) return null;

    const allowed = new Set((Array.isArray(allowedKeywords) ? allowedKeywords : [])
      .map(keyword => String(keyword || '').trim().toLowerCase())
      .filter(Boolean));
    const merged = new Map();
    counts.forEach((item) => {
      const keyword = String(item?.keyword || '').trim();
      const count = Number(item?.count || 0);
      if (!keyword || count <= 0) return;
      const key = keyword.toLowerCase();
      if (allowed.size && !allowed.has(key)) return;
      const current = merged.get(key) || { keyword, count: 0 };
      current.count += count;
      merged.set(key, current);
    });
    return Array.from(merged.values());
  }

  buildKeywordStats(records) {
    const keywordStats = {};

    (Array.isArray(records) ? records : []).forEach(record => {
      const keywords = this.parseBrandKeywords(record?.brand_keywords);
      const storedCounts = this.parseStoredKeywordCounts(record, keywords);
      const keywordRows = storedCounts || keywords.map(keyword => ({ keyword, count: 1 }));

      keywordRows.forEach(({ keyword, count }) => {
        if (!keywordStats[keyword]) {
          keywordStats[keyword] = {
            keyword,
            total_mentions: 0,
            total_recommendations: 0,
            avg_exposure_rate: 0,
            avg_recommendation_rate: 0,
            platform_distribution: {},
            records: [],
            sample_count: 0
          };
        }

        const stats = keywordStats[keyword];
        const detail = record.visibilityMetric || record.resultDetail;
        const mentionCount = Number(count || 0) > 0 ? Number(count) : 1;
        stats.total_mentions += mentionCount;
        stats.sample_count++;

        const recommendationCount = detail?.recommendation_count ?? detail?.brand_mentions ?? 0;
        const exposureRate = detail?.exposure_rate ?? (detail?.brand_mentioned ? 100 : 0);
        const recommendationRate = detail?.recommendation_rate ?? (detail?.brand_recommended ? 100 : 0);

        stats.total_recommendations += recommendationCount;
        stats.avg_exposure_rate += exposureRate;
        stats.avg_recommendation_rate += recommendationRate;

        if (!stats.platform_distribution[record.platform]) {
          stats.platform_distribution[record.platform] = 0;
        }
        stats.platform_distribution[record.platform] += mentionCount;

        stats.records.push({
          platform: record.platform,
          date: record.created_at,
          mention_count: mentionCount,
          recommendation_count: recommendationCount,
          exposure_rate: exposureRate,
          recommendation_rate: recommendationRate
        });
      });
    });

    Object.values(keywordStats).forEach(stats => {
      if (stats.sample_count > 0) {
        stats.avg_exposure_rate = (stats.avg_exposure_rate / stats.sample_count).toFixed(2);
        stats.avg_recommendation_rate = (stats.avg_recommendation_rate / stats.sample_count).toFixed(2);
      }
      delete stats.sample_count;
    });

    return Object.values(keywordStats);
  }

  buildUserAverageStats(metrics) {
    const rows = Array.isArray(metrics) ? metrics : [];
    if (!rows.length) {
      return {
        avg_recommendation_rate: 0,
        avg_exposure_rate: 0,
        avg_recommendation_count: 0
      };
    }

    const totals = rows.reduce((acc, metric) => {
      acc.mentioned += metric?.brand_mentioned ? 1 : 0;
      acc.recommended += metric?.brand_recommended ? 1 : 0;
      acc.mentions += Number(metric?.brand_mentions || 0);
      return acc;
    }, { mentioned: 0, recommended: 0, mentions: 0 });

    return {
      avg_recommendation_rate: Number(((totals.recommended / rows.length) * 100).toFixed(2)),
      avg_exposure_rate: Number(((totals.mentioned / rows.length) * 100).toFixed(2)),
      avg_recommendation_count: Number((totals.mentions / rows.length).toFixed(2))
    };
  }
}

module.exports = new StatisticsService();

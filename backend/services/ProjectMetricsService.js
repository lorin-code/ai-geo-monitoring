const PromptCategoryService = require('./PromptCategoryService');

class ProjectMetricsService {
  normalizeDays(value, fallback = 30) {
    const parsed = Number.parseInt(value ?? fallback, 10);
    const days = Number.isFinite(parsed) ? parsed : fallback;
    return Math.max(1, Math.min(365, days));
  }

  normalizeReferenceDate(value = new Date()) {
    const date = value instanceof Date ? new Date(value) : new Date(value || Date.now());
    return Number.isNaN(date.getTime()) ? new Date() : date;
  }

  startOfLocalDay(value = new Date()) {
    const date = this.normalizeReferenceDate(value);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  buildPeriodWindow(days = 30, options = {}) {
    const safeDays = this.normalizeDays(days);
    const periodEnd = this.normalizeReferenceDate(options.referenceDate);
    const periodStart = this.startOfLocalDay(periodEnd);
    periodStart.setDate(periodStart.getDate() - (safeDays - 1));
    const changePeriodStart = this.startOfLocalDay(periodEnd);
    changePeriodStart.setDate(changePeriodStart.getDate() - ((safeDays * 2) - 1));

    return {
      days: safeDays,
      periodStart,
      periodEnd,
      changePeriodStart
    };
  }

  pct(numerator, denominator) {
    if (!denominator) return 0;
    return Number(((numerator / denominator) * 100).toFixed(2));
  }

  avg(values) {
    const nums = values.map(Number).filter((n) => Number.isFinite(n));
    if (!nums.length) return 0;
    return Number((nums.reduce((sum, n) => sum + n, 0) / nums.length).toFixed(2));
  }

  formatDateKey(date) {
    const value = date instanceof Date ? date : new Date(date || Date.now());
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }

  summarize(metrics) {
    const rows = Array.isArray(metrics) ? metrics : [];
    const total = rows.length;
    const mentioned = rows.filter((row) => !!row.brand_mentioned).length;
    const cited = rows.filter((row) => Number(row.citation_count || 0) > 0).length;
    const ownedCited = rows.filter((row) => Number(row.owned_citation_count || 0) > 0).length;
    const recommended = rows.filter((row) => !!row.brand_recommended).length;
    const sentimentRows = rows.filter((row) => !!row.brand_mentioned);
    const negative = sentimentRows.filter((row) => row.sentiment === 'negative').length;
    const platformMap = new Map();
    const competitorMap = new Map();
    const categoryMap = new Map();

    for (const row of rows) {
      const platform = row.platform || 'unknown';
      const platformEntry = platformMap.get(platform) || {
        platform,
        checks: 0,
        mentions: 0,
        cited: 0,
        recommended: 0,
        shareValues: [],
        rankValues: []
      };
      platformEntry.checks += 1;
      if (row.brand_mentioned) platformEntry.mentions += 1;
      if (Number(row.citation_count || 0) > 0) platformEntry.cited += 1;
      if (row.brand_recommended) platformEntry.recommended += 1;
      platformEntry.shareValues.push(Number(row.share_of_voice || 0));
      if (Number(row.brand_rank || 0) > 0) platformEntry.rankValues.push(Number(row.brand_rank));
      platformMap.set(platform, platformEntry);

      const category = PromptCategoryService.derive({
        prompt_category: row.prompt_category,
        question: row.question,
        tags: row.tags
      });
      const categoryEntry = categoryMap.get(category) || {
        category,
        checks: 0,
        mentions: 0,
        cited: 0,
        recommended: 0,
        shareValues: []
      };
      categoryEntry.checks += 1;
      if (row.brand_mentioned) categoryEntry.mentions += 1;
      if (Number(row.citation_count || 0) > 0) categoryEntry.cited += 1;
      if (row.brand_recommended) categoryEntry.recommended += 1;
      categoryEntry.shareValues.push(Number(row.share_of_voice || 0));
      categoryMap.set(category, categoryEntry);

      const competitors = Array.isArray(row.competitor_mentions) ? row.competitor_mentions : [];
      for (const competitor of competitors) {
        const mentionCount = Number(competitor?.mentions || 0);
        const visibilityScore = Number(competitor?.visibility_score || 0);
        if (!competitor?.mentioned && mentionCount <= 0 && visibilityScore <= 0) continue;
        const name = competitor?.name || '未知竞品';
        const competitorEntry = competitorMap.get(name) || { name, mentions: 0, appeared_checks: 0, visibility_score: 0 };
        competitorEntry.mentions += mentionCount;
        competitorEntry.visibility_score += visibilityScore;
        if (competitor?.mentioned || mentionCount > 0 || visibilityScore > 0) competitorEntry.appeared_checks += 1;
        competitorMap.set(name, competitorEntry);
      }
    }

    const platforms = Array.from(platformMap.values())
      .map((item) => ({
        platform: item.platform,
        checks: item.checks,
        brand_mention_rate: this.pct(item.mentions, item.checks),
        avg_share_of_voice: this.avg(item.shareValues),
        citation_rate: this.pct(item.cited, item.checks),
        recommendation_rate: this.pct(item.recommended, item.checks),
        avg_brand_rank: this.avg(item.rankValues)
      }))
      .sort((a, b) => a.platform.localeCompare(b.platform));

    const competitors = Array.from(competitorMap.values())
      .map((item) => {
        const result = {
          name: item.name,
          mentions: item.mentions,
          appeared_checks: item.appeared_checks
        };
        if (Number(item.visibility_score || 0) > 0) result.visibility_score = Number(item.visibility_score.toFixed(2));
        return result;
      })
      .sort((a, b) => (
        Number(b.visibility_score || 0) - Number(a.visibility_score || 0)
        || b.mentions - a.mentions
        || a.name.localeCompare(b.name)
      ));
    const categories = Array.from(categoryMap.values())
      .map((item) => ({
        category: item.category,
        checks: item.checks,
        brand_mention_rate: this.pct(item.mentions, item.checks),
        avg_share_of_voice: this.avg(item.shareValues),
        citation_rate: this.pct(item.cited, item.checks),
        recommendation_rate: this.pct(item.recommended, item.checks)
      }))
      .sort((a, b) => a.category.localeCompare(b.category, 'zh-Hans-CN'));

    return {
      total_checks: total,
      brand_mentioned_checks: mentioned,
      brand_mention_rate: this.pct(mentioned, total),
      avg_share_of_voice: this.avg(rows.map((row) => row.share_of_voice || 0)),
      citation_rate: this.pct(cited, total),
      owned_citation_rate: this.pct(ownedCited, total),
      recommendation_rate: this.pct(recommended, total),
      avg_brand_rank: this.avg(rows.map((row) => row.brand_rank || 0).filter((rank) => Number(rank) > 0)),
      negative_sentiment_rate: this.pct(negative, sentimentRows.length),
      platforms,
      competitors,
      categories
    };
  }

  summarizeRuns(records) {
    const rows = Array.isArray(records) ? records : [];
    const total = rows.length;
    const completed = rows.filter((row) => row.status === 'completed').length;
    const failed = rows.filter((row) => row.status === 'failed').length;
    const pending = rows.filter((row) => row.status === 'pending').length;
    return {
      total_runs: total,
      completed_runs: completed,
      failed_runs: failed,
      pending_runs: pending,
      failure_rate: this.pct(failed, total)
    };
  }

  buildDashboardSummary({ metrics, records, prompts, sourceAnalysis } = {}) {
    const metricRows = Array.isArray(metrics) ? metrics : [];
    const recordRows = Array.isArray(records) ? records : [];
    const promptRows = Array.isArray(prompts) ? prompts : [];
    const source = sourceAnalysis && typeof sourceAnalysis === 'object' ? sourceAnalysis : {};

    return {
      ...this.summarize(metricRows),
      ...this.summarizeRuns(recordRows),
      categories: this.buildPromptCoverage(promptRows, metricRows, recordRows),
      source_summary: source.summary || {},
      source_types: Array.isArray(source.source_types) ? source.source_types : [],
      source_domains: Array.isArray(source.domains) ? source.domains.slice(0, 20) : [],
      source_urls: Array.isArray(source.urls) ? source.urls.slice(0, 20) : [],
      source_changes: source.source_changes || {
        new_domains: [],
        dropped_domains: [],
        retained_domains: [],
        new_urls: [],
        dropped_urls: [],
        retained_urls: []
      }
    };
  }

	  buildPromptCoverage(prompts, metrics, records = []) {
	    const promptRows = Array.isArray(prompts) ? prompts : [];
	    const metricRows = Array.isArray(metrics) ? metrics : [];
	    const recordRows = Array.isArray(records) ? records : [];
	    const categoryMap = new Map();
	    const promptCategoryMap = new Map();

    for (const prompt of promptRows) {
      const category = PromptCategoryService.derive(prompt);
      const entry = categoryMap.get(category) || {
        category,
        prompt_count: 0,
        enabled_prompt_count: 0,
        checks: 0,
        mentions: 0,
        cited: 0,
        recommended: 0,
        totalRuns: 0,
        failedRuns: 0,
        shareValues: []
	      };
	      entry.prompt_count += 1;
	      if (prompt?.enabled !== false) entry.enabled_prompt_count += 1;
	      categoryMap.set(category, entry);
	      if (prompt?.id !== undefined && prompt?.id !== null) {
	        promptCategoryMap.set(String(prompt.id), category);
	      }
	    }

	    for (const row of metricRows) {
	      const promptId = row.prompt_id ?? row.tracked_prompt_id;
	      const category = promptId !== undefined && promptId !== null
	        ? promptCategoryMap.get(String(promptId))
	        : row.prompt_category || '未分类';
	      const entry = category ? categoryMap.get(category) : null;
	      if (!entry) continue;
	      entry.checks += 1;
	      if (row.brand_mentioned) entry.mentions += 1;
	      if (Number(row.citation_count || 0) > 0) entry.cited += 1;
	      if (row.brand_recommended) entry.recommended += 1;
	      entry.shareValues.push(Number(row.share_of_voice || 0));
	    }

	    for (const row of recordRows) {
	      const promptId = row.tracked_prompt_id ?? row.prompt_id;
	      const category = promptId !== undefined && promptId !== null
	        ? promptCategoryMap.get(String(promptId))
	        : null;
	      const entry = category ? categoryMap.get(category) : null;
	      if (!entry) continue;
	      const status = typeof row.status === 'string' ? row.status.trim() : '';
	      if (!status) continue;
	      entry.totalRuns += 1;
	      if (status === 'failed') entry.failedRuns += 1;
	    }

    return Array.from(categoryMap.values())
      .map((item) => ({
        category: item.category,
        prompt_count: item.prompt_count,
        enabled_prompt_count: item.enabled_prompt_count,
        total_runs: item.totalRuns,
        failed_runs: item.failedRuns,
        failure_rate: this.pct(item.failedRuns, item.totalRuns),
        checks: item.checks,
        brand_mention_rate: this.pct(item.mentions, item.checks),
        avg_share_of_voice: this.avg(item.shareValues),
        citation_rate: this.pct(item.cited, item.checks),
        recommendation_rate: this.pct(item.recommended, item.checks)
      }))
	      .sort((a, b) => b.prompt_count - a.prompt_count || a.category.localeCompare(b.category, 'zh-Hans-CN'));
	  }

	  buildPromptPerformance(prompts, metrics, records = []) {
	    const promptRows = Array.isArray(prompts) ? prompts : [];
	    const metricRows = Array.isArray(metrics) ? metrics : [];
	    const recordRows = Array.isArray(records) ? records : [];
	    const promptIds = new Set(promptRows
	      .map((prompt) => prompt?.id)
	      .filter((id) => id !== undefined && id !== null)
	      .map((id) => String(id)));
	    const result = {};

	    for (const id of promptIds) {
	      result[id] = {
	        checks: 0,
	        total_runs: 0,
	        completed_runs: 0,
	        failed_runs: 0,
	        brand_mention_rate: 0,
	        avg_share_of_voice: 0,
	        citation_rate: 0,
	        recommendation_rate: 0,
	        avg_brand_rank: 0,
	        positive_sentiment_count: 0,
	        neutral_sentiment_count: 0,
	        negative_sentiment_count: 0,
	        last_run_at: null
	      };
	    }

	    const buckets = new Map();
	    const ensureBucket = (key) => {
	      const bucket = buckets.get(key) || {
	        checks: 0,
	        mentions: 0,
	        cited: 0,
	        recommended: 0,
	        shareValues: [],
	        rankValues: [],
	        positive: 0,
	        neutral: 0,
	        negative: 0,
	        totalRuns: 0,
	        completedRuns: 0,
	        failedRuns: 0,
	        lastRunAt: null
	      };
	      buckets.set(key, bucket);
	      return bucket;
	    };
	    const touchLastRun = (bucket, row) => {
	      const createdAt = row.created_at || row.createdAt || row.detection_time || row.detectionTime || null;
	      if (createdAt && (!bucket.lastRunAt || new Date(createdAt) > new Date(bucket.lastRunAt))) {
	        bucket.lastRunAt = createdAt;
	      }
	    };

	    for (const row of metricRows) {
	      const promptId = row.prompt_id ?? row.tracked_prompt_id;
	      if (promptId === undefined || promptId === null) continue;
	      const key = String(promptId);
	      if (!promptIds.has(key)) continue;
	      const bucket = ensureBucket(key);
	      bucket.checks += 1;
	      if (row.brand_mentioned) bucket.mentions += 1;
	      if (Number(row.citation_count || 0) > 0) bucket.cited += 1;
	      if (row.brand_recommended) bucket.recommended += 1;
	      bucket.shareValues.push(Number(row.share_of_voice || 0));
	      if (Number(row.brand_rank || 0) > 0) bucket.rankValues.push(Number(row.brand_rank));
	      if (row.brand_mentioned) {
	        if (row.sentiment === 'positive') bucket.positive += 1;
	        else if (row.sentiment === 'negative') bucket.negative += 1;
	        else bucket.neutral += 1;
	      }
	      touchLastRun(bucket, row);
	    }

	    for (const row of recordRows) {
	      const promptId = row.tracked_prompt_id ?? row.prompt_id;
	      if (promptId === undefined || promptId === null) continue;
	      const key = String(promptId);
	      if (!promptIds.has(key)) continue;
	      const bucket = ensureBucket(key);
	      const status = typeof row.status === 'string' ? row.status.trim() : '';
	      if (status) {
	        bucket.totalRuns += 1;
	        if (status === 'completed') bucket.completedRuns += 1;
	        if (status === 'failed') bucket.failedRuns += 1;
	      }
	      touchLastRun(bucket, row);
	    }

	    for (const [key, bucket] of buckets.entries()) {
	      result[key] = {
	        checks: bucket.checks,
	        total_runs: bucket.totalRuns,
	        completed_runs: bucket.completedRuns,
	        failed_runs: bucket.failedRuns,
	        brand_mention_rate: this.pct(bucket.mentions, bucket.checks),
	        avg_share_of_voice: this.avg(bucket.shareValues),
	        citation_rate: this.pct(bucket.cited, bucket.checks),
	        recommendation_rate: this.pct(bucket.recommended, bucket.checks),
	        avg_brand_rank: this.avg(bucket.rankValues),
	        positive_sentiment_count: bucket.positive,
	        neutral_sentiment_count: bucket.neutral,
	        negative_sentiment_count: bucket.negative,
	        last_run_at: bucket.lastRunAt
	      };
	    }

	    return result;
	  }

	  buildTrend(metrics, days = 30, options = {}) {
    const rows = Array.isArray(metrics) ? metrics : [];
    const safeDays = this.normalizeDays(days);
    const referenceDate = options.referenceDate ? new Date(options.referenceDate) : new Date();
    const bucket = new Map();
    for (const row of rows) {
      const date = new Date(row.created_at || row.createdAt || Date.now());
      const key = this.formatDateKey(date);
      const entry = bucket.get(key) || { date: key, checks: 0, mentions: 0, cited: 0, recommended: 0, shareValues: [] };
      entry.checks += 1;
      if (row.brand_mentioned) entry.mentions += 1;
      if (Number(row.citation_count || 0) > 0) entry.cited += 1;
      if (row.brand_recommended) entry.recommended += 1;
      entry.shareValues.push(Number(row.share_of_voice || 0));
      bucket.set(key, entry);
    }

    const trend = [];
    for (let index = safeDays - 1; index >= 0; index -= 1) {
      const date = new Date(referenceDate);
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - index);
      const key = this.formatDateKey(date);
      const item = bucket.get(key) || { date: key, checks: 0, mentions: 0, cited: 0, recommended: 0, shareValues: [] };
      trend.push({
        date: item.date,
        checks: item.checks,
        brand_mention_rate: this.pct(item.mentions, item.checks),
        avg_share_of_voice: this.avg(item.shareValues),
        citation_rate: this.pct(item.cited, item.checks),
        recommendation_rate: this.pct(item.recommended, item.checks)
      });
    }

    return trend;
  }
}

module.exports = new ProjectMetricsService();

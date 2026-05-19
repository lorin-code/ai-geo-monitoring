const PRIORITY_WEIGHT = { high: 3, medium: 2, low: 1 };
const SIGNIFICANT_PLATFORM_GAP_RATE = 50;
const PLATFORM_LABELS = {
  doubao: '豆包',
  deepseek: 'DeepSeek'
};
const PromptCategoryService = require('./PromptCategoryService');
const PlatformSelectionService = require('./PlatformSelectionService');

class OpportunityInsightService {
  build({ prompts, promptPerformance, metrics, sourceOpportunities, days = 30, projectPlatforms } = {}) {
    const promptRows = Array.isArray(prompts) ? prompts : [];
    const performance = promptPerformance && typeof promptPerformance === 'object' ? promptPerformance : {};
    const metricRows = Array.isArray(metrics) ? metrics : [];
    const sourceRows = Array.isArray(sourceOpportunities) ? sourceOpportunities : [];
    const analysisDays = this.normalizeDays(days);
    const opportunities = [];
    const seen = new Set();
    const promptLookup = new Map(
      promptRows
        .filter((item) => item?.id !== undefined && item?.id !== null)
        .map((item) => [String(item.id), item])
    );
    const hasPromptCatalog = promptLookup.size > 0;
    const derivePromptCategory = (row = {}) => {
      const promptId = row?.prompt_id || row?.tracked_prompt_id || null;
      const prompt = promptId !== null ? promptLookup.get(String(promptId)) : null;
      if (prompt) return PromptCategoryService.derive(prompt);
      return PromptCategoryService.derive({
        prompt_category: row?.prompt_category,
        question: row?.question,
        tags: row?.tags
      });
    };
    const isActionablePrompt = (promptId) => {
      if (promptId === undefined || promptId === null || promptId === '') return true;
      const prompt = promptLookup.get(String(promptId));
      if (!prompt) return !hasPromptCatalog;
      return prompt.enabled !== false;
    };
    const add = (item) => {
      const key = [
        item.type,
        item.prompt_id || '',
        item.platform || '',
        item.domain || '',
        item.competitor || ''
      ].join('|');
      if (seen.has(key)) return;
      seen.add(key);
      opportunities.push({ key, ...item });
    };

    for (const prompt of promptRows) {
      if (!prompt || prompt.enabled === false) continue;
      const perf = performance[String(prompt.id)] || {};
      const checks = Number(perf.checks || 0);
      const totalRuns = Number(perf.total_runs || 0);
      const failedRuns = Number(perf.failed_runs || 0);
      if (!checks) {
        if (failedRuns > 0) {
          add({
            type: '运行失败',
            priority: 'high',
            prompt_id: prompt.id,
            prompt: prompt.question,
            prompt_category: PromptCategoryService.derive(prompt),
            evidence: `近 ${analysisDays} 天运行失败 ${failedRuns} 次，暂无有效分析数据`,
            recommendation: '先确认监测平台配置、账号额度和问题内容可正常运行，恢复成功监测后再评估可见度'
          });
          continue;
        }
        if (totalRuns > 0) {
          add({
            type: '分析数据缺失',
            priority: 'high',
            prompt_id: prompt.id,
            prompt: prompt.question,
            prompt_category: PromptCategoryService.derive(prompt),
            evidence: `近 ${analysisDays} 天运行 ${totalRuns} 次但暂无有效分析数据`,
            recommendation: '先重新运行该 Prompt，并确认回答内容完整；恢复有效分析后再判断可见度表现'
          });
          continue;
        }
        add({
          type: '未运行 Prompt',
          priority: 'medium',
          prompt_id: prompt.id,
          prompt: prompt.question,
          prompt_category: PromptCategoryService.derive(prompt),
          evidence: `近 ${analysisDays} 天没有有效分析数据`,
          recommendation: '先运行该 Prompt，补齐样本后再判断可见度表现'
        });
        continue;
      }

      const mentionRate = Number(perf.brand_mention_rate || 0);
      const sov = Number(perf.avg_share_of_voice || 0);
      if (checks < 3) {
        add({
          type: '样本不足',
          priority: 'medium',
          prompt_id: prompt.id,
          prompt: prompt.question,
          prompt_category: PromptCategoryService.derive(prompt),
          evidence: `近 ${analysisDays} 天仅 ${checks} 次有效分析`,
          recommendation: '继续运行该 Prompt，至少形成 3 次以上样本后再判断可见度是否稳定'
        });
      }

      if (checks >= 3 && (mentionRate < 50 || sov < 30)) {
        add({
          type: '低品牌可见度',
          priority: mentionRate < 50 ? 'high' : 'medium',
          prompt_id: prompt.id,
          prompt: prompt.question,
          prompt_category: PromptCategoryService.derive(prompt),
          evidence: `提及率 ${this.formatPercent(mentionRate)}，平均声量占比（SOV）${this.formatPercent(sov)}`,
          recommendation: '围绕该问题补充官网内容、第三方内容和产品证据，提升 AI 回答中的品牌出现概率'
        });
      }

      if (Number(perf.citation_rate || 0) === 0 && checks >= 3) {
        add({
          type: '引用缺口',
          priority: 'medium',
          prompt_id: prompt.id,
          prompt: prompt.question,
          prompt_category: PromptCategoryService.derive(prompt),
          evidence: `近 ${analysisDays} 天 ${checks} 次分析均未引用来源`,
          recommendation: '优先建设可被引用的产品页、FAQ、评测材料或权威第三方内容'
        });
      }
    }

    for (const row of metricRows) {
      const rowPromptId = row?.prompt_id || row?.tracked_prompt_id || null;
      if (!isActionablePrompt(rowPromptId)) continue;
      const promptCategory = derivePromptCategory(row);
      const competitors = Array.isArray(row?.competitor_mentions) ? row.competitor_mentions : [];
      const leading = competitors
        .filter((item) => item?.mentioned || Number(item?.mentions || 0) > 0)
        .sort((a, b) => (
          Number(b?.visibility_score ?? b?.mentions ?? 0) - Number(a?.visibility_score ?? a?.mentions ?? 0)
          || Number(b?.mentions || 0) - Number(a?.mentions || 0)
        ))[0];
      if (!row?.brand_mentioned && leading) {
        add({
          type: '竞品压制',
          priority: 'high',
          prompt_id: row.prompt_id || row.tracked_prompt_id || null,
          platform: row.platform || null,
          prompt_category: promptCategory,
          competitor: leading.name || '竞品',
          evidence: `${leading.name || '竞品'} 被提及 ${Number(leading.mentions || 0)} 次，品牌未被提及`,
          recommendation: '分析该竞品被推荐的原因，补充对比页、差异化卖点和第三方证明'
        });
      }
      if (row?.brand_mentioned && leading) {
        const brandScore = Number(row.visibility_score ?? row.brand_mentions ?? 0);
        const competitorScore = Number(leading.visibility_score ?? leading.mentions ?? 0);
        if (Number.isFinite(competitorScore) && Number.isFinite(brandScore) && competitorScore > brandScore) {
          add({
            type: '竞品压制',
            priority: 'high',
            prompt_id: row.prompt_id || row.tracked_prompt_id || null,
            platform: row.platform || null,
            prompt_category: promptCategory,
            competitor: leading.name || '竞品',
            evidence: `${leading.name || '竞品'} 可见度得分 ${competitorScore}，高于品牌 ${brandScore}`,
            recommendation: '分析该竞品被推荐、排序靠前或反复出现的原因，补充对比页、差异化卖点和第三方证明'
          });
        }
      }

      if (row?.brand_mentioned && row?.sentiment === 'negative') {
        const reason = this.sanitizeSentimentReason(row.sentiment_reason);
        const riskTerms = Array.isArray(row.sentiment_risk_terms)
          ? row.sentiment_risk_terms.map((item) => this.sanitizeSentimentRiskTerm(item)).filter(Boolean)
          : [];
        const evidence = [
          reason ? `判定依据：${reason}` : 'AI 回答对品牌或相关场景判定为负向',
          riskTerms.length ? `风险词：${riskTerms.join('、')}` : ''
        ].filter(Boolean).join('；');
        add({
          type: '负向情绪',
          priority: 'high',
          prompt_id: row.prompt_id || row.tracked_prompt_id || null,
          platform: row.platform || null,
          prompt_category: promptCategory,
          evidence,
          recommendation: '定位负向观点来源，补充售后、质量、风险解释和正向案例内容'
        });
      }
    }

    for (const gap of this.buildPromptPlatformGaps(metricRows, promptRows, { projectPlatforms })) {
      add(gap);
    }

    for (const source of sourceRows) {
      if (!isActionablePrompt(source.prompt_id || null)) continue;
      const sourceEvidence = source.brand_mentioned
        ? `${source.domain || '竞品来源'} 被 AI 引用，但未引用品牌自有来源`
        : `${source.domain || '竞品来源'} 被 AI 引用，但品牌未被提及`;
      add({
        type: '竞品来源缺口',
        priority: 'medium',
        prompt_id: source.prompt_id || null,
        platform: source.platform || null,
        prompt_category: derivePromptCategory(source),
        domain: source.domain || '',
        url: source.url || '',
        evidence: sourceEvidence,
        recommendation: '争取同类来源覆盖，或建设可替代引用的品牌内容与第三方评测'
      });
    }

    return opportunities
      .sort((a, b) => (
        (PRIORITY_WEIGHT[b.priority] || 0) - (PRIORITY_WEIGHT[a.priority] || 0)
        || String(a.type).localeCompare(String(b.type), 'zh-Hans-CN')
      ))
      .slice(0, 50);
  }

  buildPromptPlatformGaps(metrics, prompts, options = {}) {
    const promptRows = Array.isArray(prompts) ? prompts : [];
    const hasProjectPlatforms = Array.isArray(options.projectPlatforms) && options.projectPlatforms.length > 0;
    const projectPlatforms = hasProjectPlatforms ? PlatformSelectionService.normalize(options.projectPlatforms) : [];
    const promptLookup = new Map(
      promptRows
        .filter((item) => item?.id)
        .filter((item) => item.enabled !== false)
        .map((item) => [String(item.id), item])
    );
    const hasPromptCatalog = promptRows.some((item) => item?.id);
    const groups = new Map();

    for (const row of Array.isArray(metrics) ? metrics : []) {
      const promptId = row?.prompt_id || row?.tracked_prompt_id;
      const platform = String(row?.platform || '').trim();
      if (!promptId || !platform) continue;

      const key = String(promptId);
      if (hasPromptCatalog && !promptLookup.has(key)) continue;
      const prompt = promptLookup.get(key) || {};
      const group = groups.get(key) || {
        prompt_id: promptId,
        prompt: prompt.question || row?.question || '',
        prompt_category: PromptCategoryService.derive(prompt?.id ? prompt : {
          prompt_category: row?.prompt_category,
          question: row?.question,
          tags: row?.tags
        }),
        expected_platforms: this.resolvePromptPlatforms(prompt, projectPlatforms),
        platforms: new Map()
      };
      const platformStats = group.platforms.get(platform) || { platform, checks: 0, mentions: 0 };
      platformStats.checks += 1;
      if (row?.brand_mentioned) platformStats.mentions += 1;
      group.platforms.set(platform, platformStats);
      groups.set(key, group);
    }

    const opportunities = [];
    for (const group of groups.values()) {
      const sampledRows = Array.from(group.platforms.values());
      if ((group.expected_platforms || []).length > 1 && sampledRows.some((item) => item.checks >= 2)) {
        const sampledPlatforms = new Set(sampledRows.map((item) => item.platform));
        for (const platform of group.expected_platforms || []) {
          if (sampledPlatforms.has(platform)) continue;
          opportunities.push({
            type: '平台样本缺失',
            priority: 'medium',
            prompt_id: group.prompt_id,
            prompt: group.prompt,
            prompt_category: group.prompt_category,
            platform,
            evidence: `${this.formatPlatform(platform)}暂无有效分析样本`,
            recommendation: `检查 ${this.formatPlatform(platform)} 是否已纳入该 Prompt 的运行范围，并补齐该平台样本后再比较平台表现`
          });
        }
      }

      const platformRows = Array.from(group.platforms.values())
        .filter((item) => item.checks >= 2)
        .map((item) => ({
          ...item,
          mention_rate: (item.mentions / item.checks) * 100
        }));
      if (platformRows.length < 2) continue;

      const strongest = [...platformRows].sort((a, b) => b.mention_rate - a.mention_rate || b.checks - a.checks)[0];
      const weakPlatforms = platformRows
        .map((item) => ({
          ...item,
          gap_rate: Number((strongest.mention_rate - item.mention_rate).toFixed(2))
        }))
        .filter((item) => item.gap_rate >= SIGNIFICANT_PLATFORM_GAP_RATE && strongest.mention_rate >= 50)
        .sort((a, b) => b.gap_rate - a.gap_rate || a.platform.localeCompare(b.platform));
      for (const weak of weakPlatforms) {
        opportunities.push({
          type: '平台表现差距',
          priority: weak.gap_rate >= 80 ? 'high' : 'medium',
          prompt_id: group.prompt_id,
          prompt: group.prompt,
          prompt_category: group.prompt_category,
          platform: weak.platform,
          evidence: `${this.formatPlatform(strongest.platform)}提及率 ${this.formatPercent(strongest.mention_rate)}，${this.formatPlatform(weak.platform)}提及率 ${this.formatPercent(weak.mention_rate)}`,
          recommendation: `优先复盘 ${this.formatPlatform(weak.platform)} 的回答语料和引用来源，补充该平台更容易采纳的品牌证据与对比内容`
        });
      }
    }
    return opportunities;
  }

  resolvePromptPlatforms(prompt, projectPlatforms) {
    const promptPlatforms = Array.isArray(prompt?.platforms) ? prompt.platforms : [];
    if (!projectPlatforms.length && !promptPlatforms.length) return [];
    if (!projectPlatforms.length) return PlatformSelectionService.normalize(promptPlatforms);
    return PlatformSelectionService.reconcilePromptPlatforms(prompt?.platforms, projectPlatforms);
  }

  formatPercent(value) {
    const n = Number(value || 0);
    return `${Number.isFinite(n) ? Number(n.toFixed(2)) : 0}%`;
  }

  formatPlatform(platform) {
    return PLATFORM_LABELS[platform] || platform || '未知平台';
  }

  normalizeDays(value) {
    const parsed = Number.parseInt(value ?? 30, 10);
    const days = Number.isFinite(parsed) ? parsed : 30;
    return Math.max(1, Math.min(365, days));
  }

  sanitizeSentimentText(value) {
    return String(value || '')
      .replace(/DeepSeek/ig, '')
      .replace(/API\s*Key/ig, '')
      .replace(/API/ig, '')
      .replace(/\s+/g, '')
      .trim();
  }

  sanitizeSentimentReason(value) {
    const cleaned = this.sanitizeSentimentText(value).split(/[，,；;。.!！?？]/)[0] || '';
    return cleaned.slice(0, 20);
  }

  sanitizeSentimentRiskTerm(value) {
    return this.sanitizeSentimentText(value).slice(0, 14);
  }
}

module.exports = new OpportunityInsightService();

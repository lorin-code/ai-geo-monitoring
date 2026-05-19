const {
  QuestionRecord,
  ResultDetail,
  BrandCompetitor,
  VisibilityMetric
} = require('../models');
const AIPlatformService = require('./AIPlatformService');
const ResultParserService = require('./ResultParserService');
const VisibilityAnalysisService = require('./VisibilityAnalysisService');
const SentimentAnalysisService = require('./SentimentAnalysisService');
const CitationAnalysisService = require('./CitationAnalysisService');
const AlertEvaluationService = require('./AlertEvaluationService');
const PromptCategoryService = require('./PromptCategoryService');
const { consumeQuotaDirect } = require('../middleware/quota');

const MAINLAND_PLATFORMS = ['doubao', 'deepseek'];
const SAFE_PLATFORM_FAILURE_MESSAGE = '监测平台调用失败，请稍后重试';
const PLATFORM_MISMATCH_MESSAGE = 'Prompt 的监测平台与项目监测平台不一致，请检查品牌项目监测平台设置';

function countKeywordOccurrences(text, keywords) {
  const list = Array.isArray(keywords) ? keywords.filter(Boolean) : [];
  const ranges = list.flatMap((kw) => {
    const keyword = String(kw);
    return VisibilityAnalysisService.termVariants(keyword)
      .flatMap((variant) => VisibilityAnalysisService.termMatches(text, variant))
      .map((range) => ({ ...range, keyword }));
  });
  const selected = [];
  ranges
    .sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start))
    .forEach((range) => {
      if (!selected.some((item) => VisibilityAnalysisService.overlaps(item, range))) selected.push(range);
    });
  const counts = new Map();
  selected.forEach((range) => {
    counts.set(range.keyword, (counts.get(range.keyword) || 0) + 1);
  });
  return Array.from(counts.entries()).map(([keyword, count]) => ({ keyword, count }));
}

class ProjectRunService {
  isRunnableProject(project) {
    if (!project) return false;
    return (project.status || 'active') === 'active';
  }

  buildBrandKeywordList(project) {
    return VisibilityAnalysisService.buildBrandVisibilityTerms(project);
  }

  resolveRunUser(project, user) {
    const projectOwnerId = Number(project?.user_id || 0);
    const userId = Number(user?.id || 0);
    if (projectOwnerId > 0 && user?.role === 'admin' && userId !== projectOwnerId) {
      return { ...user, id: projectOwnerId, actor_user_id: userId || null };
    }
    return user;
  }

  normalizeRunPromptIds(value) {
    const explicit = value !== undefined && value !== null;
    if (!explicit) return { explicit: false, ids: [] };
    const raw = Array.isArray(value)
      ? value
      : (typeof value === 'string' ? value.split(/[,，;；\n]/) : [value]);
    const ids = raw
      .map((item) => Number(String(item || '').trim()))
      .filter((item) => Number.isInteger(item) && item > 0);
    return {
      explicit: true,
      ids: Array.from(new Set(ids))
    };
  }

  buildPromptTargets(prompts, availablePlatforms = AIPlatformService.getAvailablePlatforms(), projectPlatforms = MAINLAND_PLATFORMS) {
    const available = new Set((Array.isArray(availablePlatforms) ? availablePlatforms : [])
      .map((item) => String(item).trim().toLowerCase())
      .filter((item) => MAINLAND_PLATFORMS.includes(item)));
    const projectPlatformList = (Array.isArray(projectPlatforms) && projectPlatforms.length ? projectPlatforms : MAINLAND_PLATFORMS)
      .map((item) => String(item || '').trim().toLowerCase())
      .filter((item) => MAINLAND_PLATFORMS.includes(item));

    const rows = Array.isArray(prompts) ? prompts : [];
    return rows
      .filter((prompt) => prompt && prompt.enabled !== false)
      .flatMap((prompt) => {
        const promptPlatformList = Array.isArray(prompt.platforms) && prompt.platforms.length
          ? prompt.platforms
          : projectPlatformList;
        const promptPlatforms = new Set(promptPlatformList
          .map((item) => String(item || '').trim().toLowerCase())
          .filter((item) => MAINLAND_PLATFORMS.includes(item)));
        return Array.from(new Set(projectPlatformList
          .filter((item) => available.has(item) && promptPlatforms.has(item))))
          .map((platform) => ({ prompt, platform }));
      });
  }

  hasPromptProjectPlatformOverlap(prompts, projectPlatforms = MAINLAND_PLATFORMS) {
    const projectPlatformList = (Array.isArray(projectPlatforms) && projectPlatforms.length ? projectPlatforms : MAINLAND_PLATFORMS)
      .map((item) => String(item || '').trim().toLowerCase())
      .filter((item) => MAINLAND_PLATFORMS.includes(item));
    const projectPlatformSet = new Set(projectPlatformList);
    return (Array.isArray(prompts) ? prompts : [])
      .filter((prompt) => prompt && prompt.enabled !== false)
      .some((prompt) => {
        const promptPlatformList = Array.isArray(prompt.platforms) && prompt.platforms.length
          ? prompt.platforms
          : projectPlatformList;
        return promptPlatformList
          .map((item) => String(item || '').trim().toLowerCase())
          .filter((item) => MAINLAND_PLATFORMS.includes(item))
          .some((item) => projectPlatformSet.has(item));
      });
  }

  hasEveryPromptProjectPlatformOverlap(prompts, projectPlatforms = MAINLAND_PLATFORMS) {
    const enabledPrompts = (Array.isArray(prompts) ? prompts : [])
      .filter((prompt) => prompt && prompt.enabled !== false);
    if (!enabledPrompts.length) return false;
    return enabledPrompts.every((prompt) => this.hasPromptProjectPlatformOverlap([prompt], projectPlatforms));
  }

  derivePromptCategory(prompt) {
    return PromptCategoryService.derive(prompt);
  }

  async buildVisibilityMetricPayload({ record, responseText, aiResponse, project, competitors, prompt }) {
    const projectData = project.toJSON ? project.toJSON() : project;
    const competitorData = Array.isArray(competitors)
      ? competitors.map((item) => (item.toJSON ? item.toJSON() : item))
      : [];
    const analysis = VisibilityAnalysisService.analyzeResponse({
      responseText,
      brand: projectData,
      competitors: competitorData
    });
    const sentimentAnalysis = analysis.brand_mentioned
      ? await SentimentAnalysisService.analyzeWithDeepSeek({
          responseText,
          brand: projectData,
          competitors: competitorData
        })
      : { sentiment: 'neutral' };
    const citationAnalysis = CitationAnalysisService.extractSources({
      responseText,
      aiResponse,
      brand: projectData,
      competitors: competitorData
    });
    return {
      project_id: projectData.id,
      prompt_id: record.tracked_prompt_id || null,
      user_id: record.user_id,
      platform: record.platform,
      brand_mentioned: analysis.brand_mentioned,
      brand_mentions: analysis.brand_mentions,
      brand_position: analysis.brand_position,
      brand_rank: analysis.brand_rank,
      brand_recommended: analysis.brand_recommended,
      visibility_score: analysis.visibility_score,
      competitor_mentions: analysis.competitor_mentions,
      share_of_voice: analysis.share_of_voice,
      citation_count: citationAnalysis.citation_count,
      owned_citation_count: citationAnalysis.owned_citation_count,
      competitor_citation_count: citationAnalysis.competitor_citation_count,
      citation_sources: citationAnalysis.sources,
      prompt_category: this.derivePromptCategory(prompt),
      sentiment: sentimentAnalysis.sentiment,
      sentiment_reason: sentimentAnalysis.reason || null,
      sentiment_risk_terms: Array.isArray(sentimentAnalysis.risk_terms) ? sentimentAnalysis.risk_terms : []
    };
  }

  async createVisibilityMetric({ record, responseText, aiResponse, project, competitors, prompt }) {
    const payload = await this.buildVisibilityMetricPayload({
      record,
      responseText,
      aiResponse,
      project,
      competitors,
      prompt
    });
    const existing = await VisibilityMetric.findOne({ where: { question_record_id: record.id } });
    if (existing) return existing.update(payload);
    return VisibilityMetric.create({ ...payload, question_record_id: record.id });
  }

  async finalizeSuccessfulRecord({ record, responseText, aiResponse, project, competitors, prompt, keywords }) {
    const keywordCounts = countKeywordOccurrences(responseText, keywords, true);
    try {
      const metric = await this.createVisibilityMetric({
        record,
        responseText,
        aiResponse,
        project,
        competitors,
        prompt
      });
      await record.update({ status: 'completed', result_summary: { keyword_counts: keywordCounts } });
      return {
        ok: true,
        status: 'completed',
        metric,
        keyword_counts: keywordCounts
      };
    } catch (error) {
      const message = '指标生成失败，请稍后重试';
      await record.update({ status: 'failed', error_message: message });
      return {
        ok: false,
        status: 'failed',
        error: message
      };
    }
  }

  formatError(error) {
    return error?.message || String(error || '未知错误');
  }

  async failRecord(record, message) {
    if (!record?.update) return;
    try {
      await record.update({ status: 'failed', error_message: message });
    } catch (updateError) {
      console.warn('标记项目运行记录失败异常:', updateError?.message || updateError);
    }
  }

  async createTargetRecord({ target, runUser, projectData, keywords }) {
    const prompt = target.prompt;
    return QuestionRecord.create({
      user_id: runUser.id,
      project_id: projectData.id,
      tracked_prompt_id: prompt.id,
      platform: target.platform,
      question: prompt.question,
      brand: projectData.name,
      brand_keywords: keywords.join(','),
      status: 'pending'
    });
  }

  async createRunEntries({ targets, runUser, projectData, keywords }) {
    const rows = [];
    for (const target of targets) {
      const record = await this.createTargetRecord({ target, runUser, projectData, keywords });
      rows.push({ target, record });
    }
    return rows;
  }

  getProjectRunConcurrency() {
    const configured = Number.parseInt(process.env.PROJECT_RUN_CONCURRENCY || '', 10);
    if (Number.isInteger(configured) && configured > 0) return Math.min(configured, 5);
    return 2;
  }

  async runPreparedTargets({ entries, runUser, projectData, competitors, keywords, concurrency = this.getProjectRunConcurrency() }) {
    const rows = Array.isArray(entries) ? entries : [];
    const results = new Array(rows.length);
    let nextIndex = 0;
    const workerCount = Math.max(1, Math.min(Number(concurrency) || 1, rows.length || 1));

    const runNext = async () => {
      while (nextIndex < rows.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        const entry = rows[currentIndex];
        results[currentIndex] = await this.runTarget({
          target: entry.target,
          record: entry.record,
          runUser,
          projectData,
          competitors,
          keywords
        });
      }
    };

    await Promise.all(Array.from({ length: workerCount }, runNext));
    return results;
  }

  async runTarget({ target, record: preparedRecord = null, runUser, projectData, competitors, keywords }) {
    const prompt = target.prompt;
    let record = preparedRecord;
    try {
      if (!record) {
        record = await this.createTargetRecord({ target, runUser, projectData, keywords });
      }

      const aiResult = await AIPlatformService.queryPlatform(target.platform, prompt.question);
      if (!aiResult.success) {
        await this.failRecord(record, SAFE_PLATFORM_FAILURE_MESSAGE);
        return {
          record_id: record.id,
          prompt_id: prompt.id,
          platform: target.platform,
          status: 'failed',
          error: SAFE_PLATFORM_FAILURE_MESSAGE
        };
      }

      const originalText = ResultParserService.extractResponseText(aiResult.data);
      if (!String(originalText || '').trim()) {
        const message = '监测平台返回内容为空';
        await this.failRecord(record, message);
        return {
          record_id: record.id,
          prompt_id: prompt.id,
          platform: target.platform,
          status: 'failed',
          error: message
        };
      }
      await ResultDetail.create({
        question_record_id: record.id,
        ai_response_original: originalText,
        parsing_status: 'completed'
      });

      const finalization = await this.finalizeSuccessfulRecord({
        record,
        responseText: originalText,
        aiResponse: aiResult.data,
        project: projectData,
        competitors,
        prompt,
        keywords
      });
      if (!finalization.ok) {
        return {
          record_id: record.id,
          prompt_id: prompt.id,
          platform: target.platform,
          status: 'failed',
          error: finalization.error
        };
      }

      const metric = finalization.metric;
      return {
        record_id: record.id,
        prompt_id: prompt.id,
        platform: target.platform,
        status: 'completed',
        sentiment: metric.sentiment,
        share_of_voice: metric.share_of_voice,
        brand_mentioned: metric.brand_mentioned,
        citation_count: metric.citation_count,
        brand_rank: metric.brand_rank,
        brand_recommended: metric.brand_recommended
      };
    } catch (error) {
      const message = SAFE_PLATFORM_FAILURE_MESSAGE;
      await this.failRecord(record, message);
      return {
        record_id: record?.id || null,
        prompt_id: prompt?.id || null,
        platform: target.platform,
        status: 'failed',
        error: message
      };
    }
  }

  summarizeRunResults(results, total) {
    const completed = results.filter((item) => item.status === 'completed').length;
    const failed = results.filter((item) => item.status === 'failed').length;
    let message = '项目单次分析已完成';
    if (completed === 0 && failed > 0) {
      message = '项目单次分析全部失败，请检查监测平台配置、账号额度或网络连接';
    } else if (failed > 0) {
      message = '项目单次分析已完成，部分平台失败';
    }
    return { total, completed, failed, message };
  }

  async evaluateAlertsAfterRun(projectData, runUser) {
    try {
      await AlertEvaluationService.evaluateProject(projectData.id, runUser.id);
      return { ok: true };
    } catch (error) {
      const message = this.formatError(error);
      console.warn('项目运行告警评估失败:', message);
      return { ok: false, error: message };
    }
  }

  async runProject({ project, prompts, platforms, user, promptSelectionExplicit = false }) {
    const projectData = project.toJSON ? project.toJSON() : project;
    const runUser = this.resolveRunUser(projectData, user);
    if (!this.isRunnableProject(projectData)) {
      return { ok: false, status: 400, message: '归档项目不能运行分析' };
    }
    const projectPlatforms = Array.isArray(platforms) && platforms.length
      ? platforms
      : (Array.isArray(projectData.platforms) && projectData.platforms.length ? projectData.platforms : MAINLAND_PLATFORMS);
    if (promptSelectionExplicit && Array.isArray(prompts) && prompts.length && !this.hasEveryPromptProjectPlatformOverlap(prompts, projectPlatforms)) {
      return { ok: false, status: 400, message: PLATFORM_MISMATCH_MESSAGE };
    }
    const targets = this.buildPromptTargets(prompts, AIPlatformService.getAvailablePlatforms(), projectPlatforms);
    if (!targets.length) {
      if (promptSelectionExplicit && !(Array.isArray(prompts) && prompts.length)) {
        return { ok: false, status: 400, message: '选择的 Prompt 不存在或已停用' };
      }
      if (Array.isArray(prompts) && prompts.length && !this.hasPromptProjectPlatformOverlap(prompts, projectPlatforms)) {
        return { ok: false, status: 400, message: PLATFORM_MISMATCH_MESSAGE };
      }
      return { ok: false, status: 400, message: '没有可运行的启用 Prompt，或监测平台暂不可用' };
    }

    const quota = await consumeQuotaDirect(runUser.id, 'detection', targets.length);
    if (!quota.ok) {
      const reasonMap = {
        not_allowed: '当前会员等级不允许使用该功能',
        exceeded: '今日可用检测次数不足',
        error: '配额检查失败'
      };
      return { ok: false, status: 403, message: reasonMap[quota.reason] || '配额不足' };
    }

    const competitors = await BrandCompetitor.findAll({
      where: { project_id: projectData.id },
      order: [['id', 'ASC']]
    });
    const keywords = this.buildBrandKeywordList(projectData);
    const entries = await this.createRunEntries({ targets, runUser, projectData, keywords });
    const results = await this.runPreparedTargets({ entries, runUser, projectData, competitors, keywords });

    await this.evaluateAlertsAfterRun(projectData, runUser);
    const summary = this.summarizeRunResults(results, targets.length);
    const ok = summary.completed > 0;

    return {
      ok,
      status: ok ? 200 : 502,
      message: summary.message,
      data: {
        total: summary.total,
        completed: summary.completed,
        failed: summary.failed,
        results
      }
    };
  }
}

module.exports = new ProjectRunService();

const { BrandProject, BrandCompetitor, TrackedPrompt } = require('../models');
const ProjectRunService = require('./ProjectRunService');
const VisibilityAnalysisService = require('./VisibilityAnalysisService');

const SAFE_METRIC_FAILURE_MESSAGE = '指标生成失败，请稍后重试';

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

async function finalize({
  record,
  responseText,
  aiResponse = null,
  keywords = [],
  repositories = {},
  projectRunService = ProjectRunService
}) {
  if (!String(responseText || '').trim()) {
    const message = '监测平台返回内容为空';
    await record.update({ status: 'failed', error_message: message });
    return { ok: false, status: 'failed', error: new Error(message) };
  }

  const keywordCounts = countKeywordOccurrences(responseText, keywords);
  if (!record?.project_id) {
    await record.update({
      status: 'completed',
      result_summary: { keyword_counts: keywordCounts }
    });
    return { ok: true, status: 'completed' };
  }

  const ProjectRepository = repositories.BrandProject || BrandProject;
  const CompetitorRepository = repositories.BrandCompetitor || BrandCompetitor;
  const PromptRepository = repositories.TrackedPrompt || TrackedPrompt;

  try {
    const project = await ProjectRepository.findByPk(record.project_id);
    if (!project) {
      const message = SAFE_METRIC_FAILURE_MESSAGE;
      await record.update({ status: 'failed', error_message: message });
      return { ok: false, status: 'failed', error: new Error(message) };
    }
    const competitors = await CompetitorRepository.findAll({ where: { project_id: project.id }, order: [['id', 'ASC']] });
    const prompt = record.tracked_prompt_id
      ? await PromptRepository.findOne({ where: { id: record.tracked_prompt_id, project_id: project.id } })
      : null;
    return await projectRunService.finalizeSuccessfulRecord({
      record,
      responseText,
      aiResponse,
      project,
      competitors,
      prompt,
      keywords
    });
  } catch (error) {
    const message = SAFE_METRIC_FAILURE_MESSAGE;
    try {
      await record.update({ status: 'failed', error_message: message });
    } catch (updateError) {
      console.warn('标记项目检测指标失败记录异常:', updateError?.message || updateError);
    }
    return { ok: false, status: 'failed', error: new Error(message) };
  }
}

module.exports = {
  countKeywordOccurrences,
  finalize
};

// @ts-nocheck
'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Card, Col, Descriptions, Empty, Form, Input, InputNumber, Modal, Popconfirm, Row, Select, Space, Switch, Table, Tag, Tooltip, Typography, message } from 'antd';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkKeywordHighlight from '@/utils/remarkKeywordHighlight';
import { resolveKeywordStats } from '@/utils/keywordStats.cjs';
import { buildBrandKeywords } from '@/utils/brandKeywords.cjs';
import { canSaveGeneratedPrompts } from '@/utils/generatedPromptSaveState.cjs';
import { getHistoryAnalysisDisplay } from '@/utils/historyAnalysisDisplay.cjs';
import { normalizeHistoryCitationSources } from '@/utils/historyCitationSources.cjs';
import { formatHistoryErrorMessage, formatHistoryParsingErrorMessage } from '@/utils/historyErrorDisplay.cjs';
import { getRunResultNotice } from '@/utils/runResultMessage.cjs';
import { getApiErrorMessage } from '@/utils/apiErrorMessage.cjs';
import { getApiRunResultData } from '@/utils/apiRunResult.cjs';
import {
  getSelectablePromptProjects,
  resolveSelectedPromptProjectId,
  shouldClearGeneratedPromptSuggestions,
  shouldResetPromptListFilters,
  shouldResetPromptSelection
} from '@/utils/promptSelection.cjs';
import {
  PROMPT_GENERATION_MAX_COUNT,
  PROMPT_GENERATION_MIN_COUNT
} from '@/utils/promptGenerationLimits.cjs';
import { getProjectPromptRunBlockReason } from '@/utils/projectPromptSummary.cjs';
import { filterPromptRows } from '@/utils/promptListFilters.cjs';
import { MONITORING_PLATFORMS, MONITORING_PLATFORM_OPTIONS } from '@/utils/monitoringPlatforms.cjs';
import useUserPlatforms from '@/hooks/useUserPlatforms';
import usePromptGenerationPlatforms from '@/hooks/usePromptGenerationPlatforms';
import Link from 'next/link';

const { Text } = Typography;

const platformLabels = {
  doubao: '豆包',
  deepseek: 'DeepSeek', qianwen: '千问', kimi: 'Kimi',
};

const statusLabels = {
  completed: '已完成',
  failed: '失败',
  pending: '进行中',
};

const sourceTypeColors = {
  自有来源: 'green',
  竞品来源: 'red',
  第三方来源: 'default',
};

const periodOptions = [
  { label: '近 7 天', value: 7 },
  { label: '近 30 天', value: 30 },
  { label: '近 90 天', value: 90 },
];

const promptRunBlockMessages = {
  no_enabled_prompt: 'Prompt 已停用，启用后才能运行',
  platform_mismatch: 'Prompt 的监测平台与项目监测平台不一致，请检查品牌项目监测平台设置'
};

const formatDateTimeShort = (value) => {
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '-';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${dd} ${hh}:${mm}`;
  } catch {
    return '-';
  }
};

const percent = (value) => {
  const n = Number(value || 0);
  return Number.isFinite(n) ? `${Number(n.toFixed(2))}%` : '0%';
};

const formatRank = (value) => {
  const n = Number(value || 0);
  return Number.isFinite(n) && n > 0 ? Number(n.toFixed(2)) : '-';
};

export default function GeoPromptsPage() {
  const { availablePlatforms } = useUserPlatforms();
  const router = useRouter();
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const generationPlatforms = usePromptGenerationPlatforms(selectedProjectId);
  const [prompts, setPrompts] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [promptsLoading, setPromptsLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState(null);
  const [runningPromptId, setRunningPromptId] = useState(null);
  const [selectedPromptIds, setSelectedPromptIds] = useState([]);
  const [promptSearch, setPromptSearch] = useState('');
  const [promptStatusFilter, setPromptStatusFilter] = useState('all');
  const [promptPlatformFilter, setPromptPlatformFilter] = useState('all');
  const [promptCategoryFilter, setPromptCategoryFilter] = useState('all');
  const [days, setDays] = useState(30);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyPrompt, setHistoryPrompt] = useState(null);
  const [historyRows, setHistoryRows] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [savingGenerated, setSavingGenerated] = useState(false);
  const [generatedSuggestions, setGeneratedSuggestions] = useState([]);
  const [generatedBy, setGeneratedBy] = useState(null);
  const [generatorForm] = Form.useForm();
  const [form] = Form.useForm();
  const previousProjectIdRef = useRef(null);
  const currentProjectIdRef = useRef(null);
  const promptsRequestRef = useRef(0);
  const generationRequestRef = useRef(0);
  const generatedSaveRequestRef = useRef(0);
  const historyRequestRef = useRef(0);
  const runRequestRef = useRef(0);

  const selectedProject = useMemo(
    () => projects.find((item) => item.id === selectedProjectId) || null,
    [projects, selectedProjectId]
  );

  const normalizeList = (value) => Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean)
    : [];

  const projectPlatforms = useMemo(() => {
    const list = normalizeList(selectedProject?.platforms).filter((item) => MONITORING_PLATFORMS.includes(item));
    return list.length ? list : MONITORING_PLATFORMS;
  }, [selectedProject]);

  const getProjectPlatforms = () => projectPlatforms;
  const getUsableProjectPlatforms = () => projectPlatforms.filter((platform) => availablePlatforms.includes(platform));

  const filteredPrompts = useMemo(() => {
    return filterPromptRows(prompts, {
      search: promptSearch,
      status: promptStatusFilter,
      platform: promptPlatformFilter,
      category: promptCategoryFilter,
      projectPlatforms
    });
  }, [prompts, promptSearch, promptStatusFilter, promptPlatformFilter, promptCategoryFilter, projectPlatforms]);

  const selectedFilteredCount = useMemo(() => {
    const selected = new Set(selectedPromptIds);
    return filteredPrompts.filter((item) => selected.has(item.id)).length;
  }, [filteredPrompts, selectedPromptIds]);

  const promptCategoryOptions = useMemo(() => {
    const categories = Array.from(new Set(
      prompts
        .map((item) => String(item?.category || item?.prompt_category || '').trim())
        .filter(Boolean)
    )).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
    return [
      { label: '全部分类', value: 'all' },
      ...categories.map((item) => ({ label: item, value: item }))
    ];
  }, [prompts]);

  const getPromptPlatforms = (row) => {
    const list = normalizeList(row?.platforms).filter((item) => platformLabels[item]);
    return list.length ? list : getProjectPlatforms();
  };

  const getPromptRunDisabledReason = (row) => {
    if (getPromptPlatforms(row).some((platform) => !availablePlatforms.includes(platform))) return '请先在个人中心校验并保存 Prompt 平台的密钥';
    const reason = getProjectPromptRunBlockReason([row], getProjectPlatforms());
    return reason ? promptRunBlockMessages[reason] : '';
  };

  const getBrandKeywords = (row) => {
    return buildBrandKeywords({
      rowBrand: row?.brand,
      projectName: selectedProject?.name,
      aliases: selectedProject?.aliases,
      primaryKeywords: selectedProject?.primary_keywords,
      rowBrandKeywords: row?.brand_keywords
    });
  };

  const getKeywordStats = (row) => {
    const brandKeywords = getBrandKeywords(row);
    const originalText = row?.resultDetail?.ai_response_original || '';
    return resolveKeywordStats({
      text: originalText,
      keywords: brandKeywords,
      storedStats: row?.result_summary?.keyword_counts,
      englishWordBoundary: true
    });
  };

  const renderHistoryDetail = (row) => {
    const brandKeywords = getBrandKeywords(row);
    const keywordStats = getKeywordStats(row);
    const analysisDisplay = getHistoryAnalysisDisplay(row);
    const statusColor = row.status === 'completed' ? 'success' : row.status === 'failed' ? 'error' : 'processing';
    const originalText = row?.resultDetail?.ai_response_original || '';
    const citationSources = normalizeHistoryCitationSources(row?.visibilityMetric?.citation_sources);
    const safeErrorMessage = formatHistoryErrorMessage(row.error_message);
    const safeParsingErrorMessage = formatHistoryParsingErrorMessage(row?.resultDetail?.parsing_error);

    return (
      <div style={{ background: '#fff', padding: 8 }}>
        <Descriptions bordered column={2} size="small" styles={{ label: { whiteSpace: 'nowrap', width: 90 } }}>
          <Descriptions.Item label="检测时间">{formatDateTimeShort(row.created_at)}</Descriptions.Item>
          <Descriptions.Item label="状态">
            <Tag color={statusColor}>{statusLabels[row.status] || row.status || '-'}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="问题" span={1}>
            <div style={{ wordBreak: 'break-word' }}>{row.question || historyPrompt?.question || '-'}</div>
          </Descriptions.Item>
          <Descriptions.Item label="检测关键词" span={1}>
            {brandKeywords.length ? (
              <Space wrap size="small">
                {brandKeywords.map((keyword, index) => <Tag key={`${keyword}-${index}`} color="blue">{keyword}</Tag>)}
              </Space>
            ) : <span>-</span>}
          </Descriptions.Item>
          <Descriptions.Item label="品牌" span={1}>{row.brand || selectedProject?.name || '-'}</Descriptions.Item>
          <Descriptions.Item label="检测平台" span={1}>
            <Tag color="processing">{platformLabels[row.platform] || String(row.platform || '-')}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="声量占比（SOV）" span={1}>
            {analysisDisplay.sov}
          </Descriptions.Item>
          <Descriptions.Item label="情绪" span={1}>
            <Tag color={analysisDisplay.sentimentColor}>{analysisDisplay.sentimentLabel}</Tag>
          </Descriptions.Item>
          {analysisDisplay.sentimentReason ? (
            <Descriptions.Item label="情绪依据" span={2}>
              <Text>{analysisDisplay.sentimentReason}</Text>
            </Descriptions.Item>
          ) : null}
          {analysisDisplay.sentimentRiskTerms.length ? (
            <Descriptions.Item label="情绪风险词" span={2}>
              <Space wrap size="small">
                {analysisDisplay.sentimentRiskTerms.map((term, index) => <Tag key={`${term}-${index}`} color="red">{term}</Tag>)}
              </Space>
            </Descriptions.Item>
          ) : null}
          {row.status === 'failed' ? (
            <Descriptions.Item label="失败原因" span={2}>
              <div style={{ whiteSpace: 'pre-wrap', color: '#cf1322' }}>{safeErrorMessage}</div>
            </Descriptions.Item>
          ) : null}
          <Descriptions.Item label="关键词统计" span={2}>
            {keywordStats.length ? (
              <Space wrap size="small">
                {keywordStats.map((item, index) => (
                  <Tag key={`${item.keyword}-${index}`} color="gold">{`${item.keyword} × ${item.count}`}</Tag>
                ))}
              </Space>
            ) : <span>-</span>}
          </Descriptions.Item>
          <Descriptions.Item label="引用来源" span={2}>
            {citationSources.length ? (
              <Space orientation="vertical" size={4} style={{ width: '100%' }}>
                {citationSources.slice(0, 8).map((source) => (
                  <Space key={`${source.url || source.domain}-${source.source_type}`} size={[6, 4]} wrap>
                    <Tag color={sourceTypeColors[source.source_type] || 'default'}>{source.source_type}</Tag>
                    {source.url ? (
                      <a href={source.url} target="_blank" rel="noreferrer">{source.domain}</a>
                    ) : (
                      <Text>{source.domain}</Text>
                    )}
                  </Space>
                ))}
                {citationSources.length > 8 ? <Text type="secondary">还有 {citationSources.length - 8} 个引用来源</Text> : null}
              </Space>
            ) : <span>-</span>}
          </Descriptions.Item>
          {row?.resultDetail?.parsing_error ? (
            <Descriptions.Item label="处理提示" span={2}>
              <div style={{ whiteSpace: 'pre-wrap', color: 'red' }}>{safeParsingErrorMessage}</div>
            </Descriptions.Item>
          ) : null}
        </Descriptions>
        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 500, color: '#1f1f1f', marginBottom: 8, textAlign: 'center' }}>回答详情</div>
          <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 12, lineHeight: 1.7, overflow: 'visible' }}>
            {originalText ? (
              <ReactMarkdown
                remarkPlugins={[
                  remarkGfm,
                  [remarkKeywordHighlight, { keywords: brandKeywords, englishWordBoundary: true }]
                ]}
                components={{
                  em: ({ children }) => (
                    <mark style={{ backgroundColor: '#fff3a1' }}>{children}</mark>
                  )
                }}
              >
                {String(originalText)}
              </ReactMarkdown>
            ) : (
              <span style={{ color: '#999' }}>{row.status === 'failed' ? safeErrorMessage : '暂无回答内容'}</span>
            )}
          </div>
        </div>
      </div>
    );
  };

  const fetchProjects = useCallback(async () => {
    setProjectsLoading(true);
    try {
      const res = await axios.get('/api/geo-projects');
      const list = Array.isArray(res?.data?.data) ? res.data.data : [];
      const selectableProjects = getSelectablePromptProjects(list);
      setProjects(selectableProjects);
      setSelectedProjectId((prev) => {
        return resolveSelectedPromptProjectId(selectableProjects, prev);
      });
    } catch (error) {
      message.error(getApiErrorMessage(error, '获取品牌项目失败'));
    } finally {
      setProjectsLoading(false);
    }
  }, []);

  const fetchPrompts = useCallback(async (projectId = selectedProjectId, targetDays = days) => {
    const requestId = promptsRequestRef.current + 1;
    promptsRequestRef.current = requestId;
    if (!projectId) {
      setPrompts([]);
      setPromptsLoading(false);
      return;
    }
    setPrompts([]);
    setPromptsLoading(true);
    try {
      const res = await axios.get(`/api/geo-projects/${projectId}/prompts`, { params: { days: targetDays } });
      if (promptsRequestRef.current === requestId) setPrompts(Array.isArray(res?.data?.data) ? res.data.data : []);
    } catch (error) {
      if (promptsRequestRef.current === requestId) {
        message.error(getApiErrorMessage(error, '获取 Prompt 列表失败'));
      }
    } finally {
      if (promptsRequestRef.current === requestId) setPromptsLoading(false);
    }
  }, [selectedProjectId, days]);

  const isCurrentPromptProject = (projectId) => currentProjectIdRef.current === projectId;

  const refreshPromptDataForProject = (projectId) => {
    if (!isCurrentPromptProject(projectId)) return;
    fetchPrompts(projectId);
    fetchProjects();
  };

  const handleProjectChange = (nextProjectId) => {
    setSelectedProjectId(nextProjectId);
    setModalOpen(false);
    setEditingPrompt(null);
    form.resetFields();
  };

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    currentProjectIdRef.current = selectedProjectId;
    if (shouldResetPromptSelection(previousProjectIdRef.current, selectedProjectId)) {
      setSelectedPromptIds([]);
    }
    if (shouldResetPromptListFilters(previousProjectIdRef.current, selectedProjectId)) {
      setPromptSearch('');
      setPromptStatusFilter('all');
      setPromptPlatformFilter('all');
      setPromptCategoryFilter('all');
    }
    if (shouldClearGeneratedPromptSuggestions(previousProjectIdRef.current, selectedProjectId)) {
      generationRequestRef.current += 1;
      generatedSaveRequestRef.current += 1;
      historyRequestRef.current += 1;
      runRequestRef.current += 1;
      setGeneratedSuggestions([]);
      setGeneratedBy(null);
      setSavingGenerated(false);
      setHistoryOpen(false);
      setHistoryPrompt(null);
      setHistoryRows([]);
      setHistoryLoading(false);
    }
    previousProjectIdRef.current = selectedProjectId;
    fetchPrompts(selectedProjectId, days);
  }, [selectedProjectId, days, fetchPrompts]);

  const openCreate = () => {
    setEditingPrompt(null);
    form.setFieldsValue({
      question: '',
      tags: [],
      enabled: true,
    });
    setModalOpen(true);
  };

  const openEdit = (record) => {
    setEditingPrompt(record);
    form.setFieldsValue({
      question: record.question || '',
      tags: normalizeList(record.tags),
      enabled: record.enabled !== false,
    });
    setModalOpen(true);
  };

  const savePrompt = async () => {
    if (!selectedProjectId) {
      message.warning('请先选择品牌项目');
      return;
    }
    const mutationProjectId = selectedProjectId;
    try {
      const values = await form.validateFields();
      const payload = {
        question: String(values.question || '').trim(),
        tags: normalizeList(values.tags),
        platforms: getUsableProjectPlatforms(),
        enabled: values.enabled !== false,
      };
      if (editingPrompt?.id) {
        await axios.put(`/api/geo-projects/${mutationProjectId}/prompts/${editingPrompt.id}`, payload);
        if (!isCurrentPromptProject(mutationProjectId)) return;
        message.success('Prompt 已更新');
      } else {
        await axios.post(`/api/geo-projects/${mutationProjectId}/prompts`, payload);
        if (!isCurrentPromptProject(mutationProjectId)) return;
        message.success('Prompt 已创建');
      }
      setModalOpen(false);
      setEditingPrompt(null);
      form.resetFields();
      refreshPromptDataForProject(mutationProjectId);
    } catch (error) {
      if (error?.errorFields) return;
      message.error(getApiErrorMessage(error, '保存 Prompt 失败'));
    }
  };

  const saveGeneratedPrompt = async (suggestion) => {
    if (!canSaveGeneratedPrompts({ projectId: selectedProjectId, suggestions: [suggestion].filter(Boolean), saving: savingGenerated })) return;
    const mutationProjectId = selectedProjectId;
    const requestId = generatedSaveRequestRef.current + 1;
    generatedSaveRequestRef.current = requestId;
    try {
      setSavingGenerated(true);
      await axios.post(`/api/geo-projects/${mutationProjectId}/prompts`, {
        question: suggestion.question,
        tags: normalizeList(suggestion.tags),
        platforms: getUsableProjectPlatforms(),
        enabled: true,
      });
      if (!(generatedSaveRequestRef.current === requestId && isCurrentPromptProject(mutationProjectId))) return;
      message.success('Prompt 已保存');
      setGeneratedSuggestions((prev) => prev.filter((item) => item.question !== suggestion.question));
      refreshPromptDataForProject(mutationProjectId);
    } catch (error) {
      if (generatedSaveRequestRef.current === requestId && isCurrentPromptProject(mutationProjectId)) {
        message.error(getApiErrorMessage(error, '保存生成 Prompt 失败'));
      }
    } finally {
      if (generatedSaveRequestRef.current === requestId && isCurrentPromptProject(mutationProjectId)) setSavingGenerated(false);
    }
  };

  const saveAllGeneratedPrompts = async () => {
    if (!canSaveGeneratedPrompts({ projectId: selectedProjectId, suggestions: generatedSuggestions, saving: savingGenerated })) return;
    const mutationProjectId = selectedProjectId;
    const requestId = generatedSaveRequestRef.current + 1;
    generatedSaveRequestRef.current = requestId;
    let saved = 0;
    let duplicated = 0;
    const completedQuestions = new Set();
    try {
      setSavingGenerated(true);
      for (const suggestion of generatedSuggestions) {
        try {
          await axios.post(`/api/geo-projects/${mutationProjectId}/prompts`, {
            question: suggestion.question,
            tags: normalizeList(suggestion.tags),
            platforms: getUsableProjectPlatforms(),
            enabled: true,
          });
          saved += 1;
          completedQuestions.add(suggestion.question);
        } catch (error) {
          if (error?.response?.status === 409) {
            duplicated += 1;
            completedQuestions.add(suggestion.question);
          }
        }
      }
    } finally {
      if (generatedSaveRequestRef.current === requestId && isCurrentPromptProject(mutationProjectId)) setSavingGenerated(false);
    }
    if (!(generatedSaveRequestRef.current === requestId && isCurrentPromptProject(mutationProjectId))) return;
    if (saved) message.success(`已保存 ${saved} 条 Prompt`);
    if (duplicated) message.warning(`${duplicated} 条 Prompt 已存在，已跳过`);
    const failed = generatedSuggestions.length - saved - duplicated;
    if (failed > 0) message.warning(`有 ${failed} 条保存失败`);
    setGeneratedSuggestions((prev) => prev.filter((item) => !completedQuestions.has(item.question)));
    refreshPromptDataForProject(mutationProjectId);
  };

  const generatePrompts = async () => {
    if (!selectedProjectId) {
      message.warning('请先选择品牌项目');
      return;
    }
    let requestId = 0;
    const generationProjectId = selectedProjectId;
    try {
      if (!generationPlatforms.platform || generationPlatforms.loading) {
        message.warning('请选择已校验的生成模型');
        return;
      }
      const values = await generatorForm.validateFields();
      requestId = generationRequestRef.current + 1;
      generationRequestRef.current = requestId;
      setGenerating(true);
      const requestedCount = Math.max(
        PROMPT_GENERATION_MIN_COUNT,
        Math.min(PROMPT_GENERATION_MAX_COUNT, Number(values.count || 10))
      );
      const res = await axios.post(`/api/geo-projects/${generationProjectId}/prompts/generate`, {
        platform: generationPlatforms.platform,
        count: requestedCount,
        focus: values.focus || '',
      });
      const suggestions = Array.isArray(res?.data?.data?.suggestions) ? res.data.data.suggestions : [];
      if (generationRequestRef.current === requestId && currentProjectIdRef.current === generationProjectId) {
        setGeneratedSuggestions(suggestions);
        setGeneratedBy({ platform: res.data.data.platform, model: res.data.data.model });
        message.success(`已生成 ${suggestions.length} 条 Prompt 建议`);
      }
    } catch (error) {
      if (error?.errorFields) return;
      if (!requestId || (generationRequestRef.current === requestId && currentProjectIdRef.current === generationProjectId)) {
        message.error(getApiErrorMessage(error, '生成 Prompt 建议失败'));
      }
    } finally {
      if (generationRequestRef.current === requestId && currentProjectIdRef.current === generationProjectId) setGenerating(false);
    }
  };

  const deletePrompt = async (record) => {
    if (!selectedProjectId) return;
    const mutationProjectId = selectedProjectId;
    try {
      await axios.delete(`/api/geo-projects/${mutationProjectId}/prompts/${record.id}`);
      if (!isCurrentPromptProject(mutationProjectId)) return;
      message.success('Prompt 已删除');
      refreshPromptDataForProject(mutationProjectId);
    } catch (error) {
      message.error(getApiErrorMessage(error, '删除 Prompt 失败'));
    }
  };

  const batchDeletePrompts = async () => {
    if (!selectedProjectId || !selectedPromptIds.length) return;
    const mutationProjectId = selectedProjectId;
    try {
      const res = await axios.post(`/api/geo-projects/${mutationProjectId}/prompts/batch-delete`, {
        prompt_ids: selectedPromptIds
      });
      if (!isCurrentPromptProject(mutationProjectId)) return;
      const deleted = res?.data?.data?.deleted || 0;
      message.success(`已删除 ${deleted} 条 Prompt`);
      setSelectedPromptIds([]);
      refreshPromptDataForProject(mutationProjectId);
    } catch (error) {
      message.error(getApiErrorMessage(error, '批量删除 Prompt 失败'));
    }
  };

  const selectAllPrompts = () => {
    setSelectedPromptIds(filteredPrompts.map((item) => item.id).filter(Boolean));
  };

  const togglePrompt = async (record) => {
    if (!selectedProjectId) return;
    const mutationProjectId = selectedProjectId;
    try {
      await axios.put(`/api/geo-projects/${mutationProjectId}/prompts/${record.id}`, { enabled: !record.enabled });
      if (!isCurrentPromptProject(mutationProjectId)) return;
      message.success(record.enabled ? 'Prompt 已停用' : 'Prompt 已启用');
      refreshPromptDataForProject(mutationProjectId);
    } catch (error) {
      message.error(getApiErrorMessage(error, '状态更新失败'));
    }
  };

  const runPrompt = async (record) => {
    if (!selectedProjectId || !record?.id) return;
    const disabledReason = getPromptRunDisabledReason(record);
    if (disabledReason) {
      message.warning(disabledReason);
      return;
    }
    const runProjectId = selectedProjectId;
    const requestId = runRequestRef.current + 1;
    runRequestRef.current = requestId;
    try {
      setRunningPromptId(record.id);
      const res = await axios.post(`/api/geo-projects/${runProjectId}/prompts/${record.id}/run`);
      const data = res?.data?.data || {};
      if (runRequestRef.current === requestId && currentProjectIdRef.current === runProjectId) {
        const notice = getRunResultNotice(data);
        message[notice.type](notice.text);
        router.push(`/geo/project-dashboard?project_id=${runProjectId}`);
      }
    } catch (error) {
      const data = getApiRunResultData(error);
      if (data && runRequestRef.current === requestId && currentProjectIdRef.current === runProjectId) {
        const notice = getRunResultNotice(data);
        message[notice.type](notice.text);
        router.push(`/geo/project-dashboard?project_id=${runProjectId}`);
      } else if (runRequestRef.current === requestId && currentProjectIdRef.current === runProjectId) {
        message.error(getApiErrorMessage(error, '运行 Prompt 失败'));
      }
    } finally {
      if (runRequestRef.current === requestId && currentProjectIdRef.current === runProjectId) setRunningPromptId(null);
    }
  };

  const openPromptHistory = async (record) => {
    if (!selectedProjectId || !record?.id) return;
    const historyProjectId = selectedProjectId;
    const requestId = historyRequestRef.current + 1;
    historyRequestRef.current = requestId;
    setHistoryPrompt(record);
    setHistoryOpen(true);
    setHistoryRows([]);
    setHistoryLoading(true);
    try {
      const res = await axios.get(`/api/geo-projects/${historyProjectId}/prompts/${record.id}/history`, {
        params: { limit: 30 }
      });
      if (historyRequestRef.current === requestId && currentProjectIdRef.current === historyProjectId) {
        setHistoryRows(Array.isArray(res?.data?.data) ? res.data.data : []);
      }
    } catch (error) {
      if (historyRequestRef.current === requestId && currentProjectIdRef.current === historyProjectId) {
        message.error(getApiErrorMessage(error, '获取 Prompt 历史失败'));
      }
    } finally {
      if (historyRequestRef.current === requestId && currentProjectIdRef.current === historyProjectId) {
        setHistoryLoading(false);
      }
    }
  };

  const columns = [
    {
      title: '问题',
      dataIndex: 'question',
      key: 'question',
      width: 420,
      render: (value) => <div style={{ wordBreak: 'break-word', lineHeight: 1.5 }}>{value}</div>
    },
    {
      title: '标签',
      dataIndex: 'tags',
      key: 'tags',
      width: 220,
      render: (values) => (
        <Space wrap size={[4, 4]}>
          {normalizeList(values).map((item) => <Tag key={item}>{item}</Tag>)}
        </Space>
      ),
    },
    {
      title: '监测平台',
      key: 'platforms',
      width: 140,
      render: (_, row) => (
        <Space wrap size={[4, 4]}>
          {getPromptPlatforms(row).map((item) => <Tag color="processing" key={item}>{platformLabels[item]}</Tag>)}
        </Space>
      ),
    },
    {
      title: `近 ${days} 天`,
      dataIndex: ['performance', 'checks'],
      key: 'checks',
      width: 90,
      render: (value) => `${Number(value || 0)} 次`,
      sorter: (a, b) => Number(a.performance?.checks || 0) - Number(b.performance?.checks || 0),
    },
    {
      title: '提及率',
      dataIndex: ['performance', 'brand_mention_rate'],
      key: 'brand_mention_rate',
      width: 100,
      render: percent,
      sorter: (a, b) => Number(a.performance?.brand_mention_rate || 0) - Number(b.performance?.brand_mention_rate || 0),
    },
    {
      title: '声量占比（SOV）',
      dataIndex: ['performance', 'avg_share_of_voice'],
      key: 'avg_share_of_voice',
      width: 90,
      render: percent,
      sorter: (a, b) => Number(a.performance?.avg_share_of_voice || 0) - Number(b.performance?.avg_share_of_voice || 0),
    },
    {
      title: '排名',
      dataIndex: ['performance', 'avg_brand_rank'],
      key: 'avg_brand_rank',
      width: 90,
      render: formatRank,
      sorter: (a, b) => Number(a.performance?.avg_brand_rank || 0) - Number(b.performance?.avg_brand_rank || 0),
    },
    {
      title: '引用率',
      dataIndex: ['performance', 'citation_rate'],
      key: 'citation_rate',
      width: 100,
      render: percent,
      sorter: (a, b) => Number(a.performance?.citation_rate || 0) - Number(b.performance?.citation_rate || 0),
    },
    {
      title: '情绪',
      key: 'sentiment',
      width: 150,
      render: (_, row) => {
        const perf = row.performance || {};
        const positive = Number(perf.positive_sentiment_count || 0);
        const neutral = Number(perf.neutral_sentiment_count || 0);
        const negative = Number(perf.negative_sentiment_count || 0);
        if (!positive && !neutral && !negative) return '-';
        return (
          <Space size={[4, 4]} wrap>
            {positive ? <Tag color="success">正 {positive}</Tag> : null}
            {neutral ? <Tag>中 {neutral}</Tag> : null}
            {negative ? <Tag color="error">负 {negative}</Tag> : null}
          </Space>
        );
      }
    },
    {
      title: '状态',
      dataIndex: 'enabled',
      key: 'enabled',
      width: 100,
      render: (value) => value !== false ? <Tag color="success">启用中</Tag> : <Tag>已停用</Tag>,
    },
    {
      title: '最近运行',
      dataIndex: ['performance', 'last_run_at'],
      key: 'last_run_at',
      width: 180,
      render: formatDateTimeShort,
      sorter: (a, b) => new Date(a.performance?.last_run_at || 0) - new Date(b.performance?.last_run_at || 0),
    },
    {
      title: '操作',
      key: 'actions',
      width: 210,
      fixed: 'right',
      render: (_, row) => {
        const disabledReason = getPromptRunDisabledReason(row);
        return (
          <Space>
            <Tooltip title={disabledReason}>
              <span>
                <Button
                  size="small"
                  loading={runningPromptId === row.id}
                  disabled={!!getPromptRunDisabledReason(row)}
                  onClick={() => runPrompt(row)}
                >
                  运行
                </Button>
              </span>
            </Tooltip>
            <Button size="small" onClick={() => openPromptHistory(row)}>历史</Button>
            <Button size="small" onClick={() => togglePrompt(row)}>{row.enabled !== false ? '停用' : '启用'}</Button>
            <Button size="small" type="primary" onClick={() => openEdit(row)}>编辑</Button>
            <Popconfirm title="确认删除该 Prompt？" onConfirm={() => deletePrompt(row)}>
              <Button size="small" danger>删除</Button>
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <Card title="Prompt 库">
        <Row gutter={[12, 12]} align="middle">
          <Col flex="360px">
            <Select
              value={selectedProjectId}
              loading={projectsLoading}
              placeholder="选择品牌项目"
              style={{ width: '100%' }}
              showSearch
              optionFilterProp="label"
              onChange={handleProjectChange}
              options={projects.map((item) => ({ label: item.name, value: item.id }))}
            />
          </Col>
          <Col flex="140px">
            <Select
              value={days}
              style={{ width: '100%' }}
              options={periodOptions}
              onChange={setDays}
            />
          </Col>
          <Col flex="auto">
            <Space wrap>
              <Button size="small" onClick={() => fetchPrompts(selectedProjectId, days)} disabled={!selectedProjectId}>刷新</Button>
              <Button size="small" type="primary" onClick={openCreate} disabled={!selectedProjectId || !getUsableProjectPlatforms().length}>新建 Prompt</Button>
              <Text type="secondary">
                {selectedProject
                  ? `当前项目：${selectedProject.name}｜监测平台：${getProjectPlatforms().map((item) => platformLabels[item]).join('、')}`
                  : '请先在品牌项目中创建项目'}
              </Text>
            </Space>
          </Col>
        </Row>
      </Card>

      <Card
        title="生成 Prompt 建议"
        extra={<Button type="primary" loading={generating} disabled={!selectedProjectId || savingGenerated || generationPlatforms.loading || !generationPlatforms.platform} onClick={generatePrompts}>生成建议</Button>}
      >
        {generationPlatforms.error && <Alert type="error" showIcon title={generationPlatforms.error}
          action={<Button size="small" onClick={generationPlatforms.retry}>重试</Button>} />}
        {selectedProjectId && !generationPlatforms.loading && !generationPlatforms.error && !generationPlatforms.platform && <p>请先<Link href="/geo/profile">配置模型密钥</Link>，校验通过后可生成建议。</p>}
        <Form form={generatorForm} layout="inline" initialValues={{ count: 10 }}>
          <Form.Item label="生成模型" extra="使用个人中心保存的模型；生成与后续监测平台可分别设置。">
            <Select aria-label="生成模型" value={generationPlatforms.platform || undefined}
              onChange={generationPlatforms.setPlatform} loading={generationPlatforms.loading}
              disabled={!selectedProjectId || generating || generationPlatforms.loading}
              placeholder="请选择已校验的模型" style={{ width: 300, maxWidth: '100%' }}
              options={generationPlatforms.items.map((item) => ({ value: item.platform,
                label: `${item.name} · ${item.model}${item.available ? '' : '（未配置有效密钥）'}`, disabled: !item.available }))} />
          </Form.Item>
          <Form.Item name="focus" label="生成重点">
            <Input placeholder="例如：购买决策、竞品对比、价格顾虑" allowClear style={{ width: 320 }} />
          </Form.Item>
          <Form.Item name="count" label="数量" rules={[{ required: true, message: '请输入数量' }]}>
            <InputNumber min={PROMPT_GENERATION_MIN_COUNT} max={PROMPT_GENERATION_MAX_COUNT} precision={0} style={{ width: 110 }} />
          </Form.Item>
          <Form.Item>
            <Space>
              <Text type="secondary">生成覆盖行业场景、品牌核心关键词与竞品对比的真实用户问题，最多 {PROMPT_GENERATION_MAX_COUNT} 条。</Text>
              <Button
                loading={savingGenerated}
                disabled={!canSaveGeneratedPrompts({ projectId: selectedProjectId, suggestions: generatedSuggestions, saving: savingGenerated })}
                onClick={saveAllGeneratedPrompts}
              >
                全部保存
              </Button>
            </Space>
          </Form.Item>
        </Form>
        {generatedSuggestions.length > 0 && generatedBy && <p><Text type="secondary">
          本批建议由 {platformLabels[generatedBy.platform] || generatedBy.platform}（{generatedBy.model}）生成。
        </Text></p>}
        {generatedSuggestions.length ? (
            <Table
              style={{ marginTop: 12 }}
              rowKey="question"
              size="small"
              dataSource={generatedSuggestions}
              pagination={{
                pageSize: 20,
                showSizeChanger: false,
                showTotal: (total) => `共 ${total} 条`,
              }}
              columns={[
              { title: '生成问题', dataIndex: 'question', ellipsis: true },
              {
                title: '标签',
                dataIndex: 'tags',
                width: 220,
                render: (values) => (
                  <Space wrap size={[4, 4]}>
                    {normalizeList(values).map((item) => <Tag key={item}>{item}</Tag>)}
                  </Space>
                ),
              },
              {
                title: '操作',
                width: 100,
                render: (_, row) => (
                  <Button
                    size="small"
                    type="primary"
                    loading={savingGenerated}
                    disabled={savingGenerated}
                    onClick={() => saveGeneratedPrompt(row)}
                  >
                    保存
                  </Button>
                ),
              },
            ]}
          />
        ) : null}
      </Card>

      <Card title="Prompt 列表">
        {selectedProjectId ? (
          <Space orientation="vertical" size={12} style={{ width: '100%' }}>
            <Space wrap style={{ justifyContent: 'space-between', width: '100%' }}>
              <Space wrap>
                <Input.Search
                  allowClear
                  placeholder="搜索问题、标签或平台"
                  style={{ width: 260 }}
                  value={promptSearch}
                  onChange={(event) => setPromptSearch(event.target.value)}
                />
                <Select
                  value={promptPlatformFilter}
                  style={{ width: 130 }}
                  onChange={setPromptPlatformFilter}
                  options={[
                    { label: '全部平台', value: 'all' },
                    ...MONITORING_PLATFORM_OPTIONS,
                  ]}
                />
                <Select
                  value={promptCategoryFilter}
                  style={{ width: 140 }}
                  onChange={setPromptCategoryFilter}
                  options={promptCategoryOptions}
                />
                <Select
                  value={promptStatusFilter}
                  style={{ width: 120 }}
                  onChange={setPromptStatusFilter}
                  options={[
                    { label: '全部状态', value: 'all' },
                    { label: '启用中', value: 'enabled' },
                    { label: '已停用', value: 'disabled' },
                  ]}
                />
                <Text type="secondary">{`显示 ${filteredPrompts.length} / ${prompts.length} 条`}</Text>
              </Space>
              <Space wrap>
                <Popconfirm
                  title={`确认删除选中的 ${selectedPromptIds.length} 条 Prompt？`}
                  disabled={!selectedPromptIds.length}
                  onConfirm={batchDeletePrompts}
                >
                  <Button danger disabled={!selectedPromptIds.length}>批量删除</Button>
                </Popconfirm>
                <Button disabled={!filteredPrompts.length || selectedFilteredCount === filteredPrompts.length} onClick={selectAllPrompts}>全选筛选结果</Button>
                <Button disabled={!selectedPromptIds.length} onClick={() => setSelectedPromptIds([])}>清空选择</Button>
                <Text type="secondary">已选择 {selectedPromptIds.length} 条</Text>
              </Space>
            </Space>
            <Table
              rowKey="id"
              dataSource={filteredPrompts}
              columns={columns}
              loading={promptsLoading}
              size="small"
              pagination={{
                defaultPageSize: 20,
                pageSizeOptions: [10, 20, 50, 100],
                showSizeChanger: true,
                showTotal: (total) => `共 ${total} 条`,
                placement: ['topRight', 'bottomRight'],
              }}
              scroll={{ x: 'max-content' }}
              rowSelection={{
                selectedRowKeys: selectedPromptIds,
                preserveSelectedRowKeys: true,
                onChange: (keys) => setSelectedPromptIds(keys),
              }}
            />
          </Space>
        ) : (
          <Empty description="暂无可用品牌项目" />
        )}
      </Card>

      <Modal
        title={editingPrompt ? '编辑 Prompt' : '新建 Prompt'}
        open={modalOpen}
        onOk={savePrompt}
        onCancel={() => { setModalOpen(false); setEditingPrompt(null); }}
        okText="保存"
        cancelText="取消"
        forceRender
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item name="question" label="问题" rules={[{ required: true, message: '请输入问题' }]}>
            <Input.TextArea rows={4} placeholder="输入需要持续追踪的用户问题" />
          </Form.Item>
          <Form.Item name="tags" label="标签">
            <Select mode="tags" tokenSeparators={[',', '，', ';', '\n']} placeholder="输入标签并回车添加" />
          </Form.Item>
          <Form.Item name="enabled" label="启用" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="停用" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={historyPrompt ? `Prompt 历史：${historyPrompt.question}` : 'Prompt 历史'}
        open={historyOpen}
        onCancel={() => { setHistoryOpen(false); setHistoryPrompt(null); setHistoryRows([]); }}
        footer={null}
        width={980}
      >
        <Table
          rowKey="id"
          size="small"
          loading={historyLoading}
          dataSource={historyRows}
          pagination={{ pageSize: 8 }}
          expandable={{
            expandedRowRender: renderHistoryDetail
          }}
          columns={[
            {
              title: '平台',
              dataIndex: 'platform',
              width: 110,
              render: (value) => <Tag>{value === 'doubao' ? '豆包' : value === 'deepseek' ? 'DeepSeek' : value === 'qianwen' ? '千问' : value === 'kimi' ? 'Kimi' : value}</Tag>
            },
            {
              title: '状态',
              dataIndex: 'status',
              width: 100,
              render: (value) => {
                const color = value === 'completed' ? 'success' : value === 'failed' ? 'error' : 'processing';
                const label = value === 'completed' ? '完成' : value === 'failed' ? '失败' : '处理中';
                return <Tag color={color}>{label}</Tag>;
              }
            },
            {
              title: '声量占比（SOV）',
              width: 100,
              render: (_, row) => getHistoryAnalysisDisplay(row).sov
            },
            {
              title: '情绪',
              width: 100,
              render: (_, row) => {
                const display = getHistoryAnalysisDisplay(row);
                return <Tag color={display.sentimentColor}>{display.sentimentLabel}</Tag>;
              }
            },
            {
              title: '品牌提及',
              width: 110,
              render: (_, row) => {
                const display = getHistoryAnalysisDisplay(row);
                return <Tag color={display.brandMentionColor}>{display.brandMentionLabel}</Tag>;
              }
            },
            {
              title: '时间',
              dataIndex: 'created_at',
              width: 180,
              render: formatDateTimeShort
            }
          ]}
        />
      </Modal>
    </Space>
  );
}

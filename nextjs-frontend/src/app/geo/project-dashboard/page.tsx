// @ts-nocheck
'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Card, Col, Empty, Row, Select, Space, Statistic, Table, Tag, Typography, message } from 'antd';
import axios from 'axios';
import { Column, Line } from '@ant-design/plots';
import { shouldRenderMetricChart } from '@/utils/dashboardChartState.cjs';
import { getBrandSentimentDisplay } from '@/utils/historyAnalysisDisplay.cjs';
import { getApiErrorMessage } from '@/utils/apiErrorMessage.cjs';
import { getSelectableProjects, resolveSelectedProjectId } from '@/utils/projectSelection.cjs';

const { Text, Title } = Typography;

const platformLabel = {
  doubao: '豆包',
  deepseek: 'DeepSeek', qianwen: '千问', kimi: 'Kimi',
};

const sourceTypeColor = {
  自有来源: 'green',
  竞品来源: 'red',
  社区问答: 'blue',
  电商平台: 'orange',
  百科资料: 'purple',
  视频内容: 'cyan',
  媒体内容: 'geekblue',
  第三方来源: 'default',
  未知来源: 'default',
};

const periodOptions = [
  { label: '近 7 天', value: 7 },
  { label: '近 30 天', value: 30 },
  { label: '近 90 天', value: 90 },
];

function extractList(res) {
  const data = res?.data?.data ?? res?.data ?? [];
  return Array.isArray(data) ? data : [];
}

function percent(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
}

function formatDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('zh-CN', { hour12: false });
}

function formatRank(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) && n > 0 ? Number(n.toFixed(2)) : '-';
}

function formatOpportunityScope(row) {
  const platform = row?.platform ? (platformLabel[row.platform] || row.platform) : '';
  const domain = row?.domain || '';
  if (platform && domain) return `${platform} / ${domain}`;
  return platform || domain || row?.competitor || '-';
}

function renderTags(values, fallbackMap = {}) {
  const list = Array.isArray(values) ? values.filter(Boolean) : [];
  if (!list.length) return '-';
  return (
    <Space size={[4, 4]} wrap>
      {list.map((item) => <Tag key={item}>{fallbackMap[item] || item}</Tag>)}
    </Space>
  );
}

export default function GeoProjectDashboardPage() {
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState();
  const [dashboard, setDashboard] = useState(null);
  const [projectLoading, setProjectLoading] = useState(false);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [days, setDays] = useState(30);
  const dashboardRequestRef = useRef(0);

  const invalidateDashboardRequest = () => {
    dashboardRequestRef.current += 1;
  };

  const handleProjectChange = (value) => {
    invalidateDashboardRequest();
    setProjectId(value);
    setDashboard(null);
    setDashboardLoading(false);
  };

  const handleDaysChange = (value) => {
    invalidateDashboardRequest();
    setDays(value);
    setDashboard(null);
    setDashboardLoading(false);
  };

  const fetchProjects = useCallback(async () => {
    setProjectLoading(true);
    try {
      const res = await axios.get('/api/geo-projects');
      const rows = getSelectableProjects(extractList(res));
      setProjects(rows);
      const queryProjectId = typeof window !== 'undefined'
        ? Number(new URLSearchParams(window.location.search).get('project_id') || 0)
        : 0;
      setProjectId((current) => resolveSelectedProjectId(rows, current, queryProjectId));
    } catch (error) {
      message.error(getApiErrorMessage(error, '获取品牌项目失败'));
    } finally {
      setProjectLoading(false);
    }
  }, []);

  const fetchDashboard = useCallback(async (id, targetDays) => {
    const requestId = dashboardRequestRef.current + 1;
    dashboardRequestRef.current = requestId;
    if (!id) {
      setDashboard(null);
      setDashboardLoading(false);
      return;
    }
    setDashboard(null);
    setDashboardLoading(true);
    try {
      const res = await axios.get(`/api/geo-projects/${id}/dashboard`, { params: { days: targetDays } });
      if (dashboardRequestRef.current === requestId) setDashboard(res?.data?.data || null);
    } catch (error) {
      if (dashboardRequestRef.current === requestId) {
        message.error(getApiErrorMessage(error, '获取项目看板失败'));
      }
    } finally {
      if (dashboardRequestRef.current === requestId) setDashboardLoading(false);
    }
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);
  useEffect(() => { fetchDashboard(projectId, days); }, [fetchDashboard, projectId, days]);

  const summary = useMemo(() => dashboard?.summary || {}, [dashboard]);
  const recentMetrics = useMemo(() => (
    Array.isArray(dashboard?.recent_metrics) ? dashboard.recent_metrics : []
  ), [dashboard]);
  const platforms = useMemo(() => (
    Array.isArray(summary.platforms) ? summary.platforms : []
  ), [summary]);
  const competitors = useMemo(() => (
    Array.isArray(summary.competitors) ? summary.competitors : []
  ), [summary]);
  const categories = useMemo(() => (
    Array.isArray(summary.categories) ? summary.categories : []
  ), [summary]);
  const sourceTypes = useMemo(() => (
    Array.isArray(summary.source_types) ? summary.source_types : []
  ), [summary]);
  const sourceDomains = useMemo(() => (
    Array.isArray(summary.source_domains) ? summary.source_domains : []
  ), [summary]);
  const sourceUrls = useMemo(() => (
    Array.isArray(summary.source_urls) ? summary.source_urls : []
  ), [summary]);
  const sourceSummary = useMemo(() => summary.source_summary || {}, [summary]);
  const sourceChanges = useMemo(() => summary.source_changes || {}, [summary]);
  const newSourceDomains = useMemo(() => (
    Array.isArray(sourceChanges.new_domains) ? sourceChanges.new_domains : []
  ), [sourceChanges]);
  const droppedSourceDomains = useMemo(() => (
    Array.isArray(sourceChanges.dropped_domains) ? sourceChanges.dropped_domains : []
  ), [sourceChanges]);
  const retainedSourceDomains = useMemo(() => (
    Array.isArray(sourceChanges.retained_domains) ? sourceChanges.retained_domains : []
  ), [sourceChanges]);
  const newSourceUrls = useMemo(() => (
    Array.isArray(sourceChanges.new_urls) ? sourceChanges.new_urls : []
  ), [sourceChanges]);
  const droppedSourceUrls = useMemo(() => (
    Array.isArray(sourceChanges.dropped_urls) ? sourceChanges.dropped_urls : []
  ), [sourceChanges]);
  const retainedSourceUrls = useMemo(() => (
    Array.isArray(sourceChanges.retained_urls) ? sourceChanges.retained_urls : []
  ), [sourceChanges]);
  const opportunities = useMemo(() => (
    Array.isArray(dashboard?.opportunities) ? dashboard.opportunities : []
  ), [dashboard]);

  const trendData = useMemo(() => {
    const rows = Array.isArray(dashboard?.trend) ? dashboard.trend : [];
    return rows.flatMap((item) => [
      { date: item.date, type: '品牌提及率', value: percent(item.brand_mention_rate) },
      { date: item.date, type: '平均声量占比（SOV）', value: percent(item.avg_share_of_voice) },
      { date: item.date, type: '引用率', value: percent(item.citation_rate) },
      { date: item.date, type: '推荐率', value: percent(item.recommendation_rate) },
    ]);
  }, [dashboard]);

  const platformRateChartData = useMemo(() => (
    platforms.flatMap((item) => [
      { platform: platformLabel[item.platform] || item.platform || '未知', type: '提及率', value: percent(item.brand_mention_rate) },
      { platform: platformLabel[item.platform] || item.platform || '未知', type: '平均声量占比（SOV）', value: percent(item.avg_share_of_voice) },
      { platform: platformLabel[item.platform] || item.platform || '未知', type: '引用率', value: percent(item.citation_rate) },
      { platform: platformLabel[item.platform] || item.platform || '未知', type: '推荐率', value: percent(item.recommendation_rate) },
    ])
  ), [platforms]);
  const platformCheckChartData = useMemo(() => (
    platforms.map((item) => ({
      platform: platformLabel[item.platform] || item.platform || '未知',
      checks: Number(item.checks || 0)
    }))
  ), [platforms]);
  const shouldShowTrendChart = useMemo(() => (
    shouldRenderMetricChart(summary, trendData)
  ), [summary, trendData]);
  const shouldShowPlatformRateChart = useMemo(() => (
    shouldRenderMetricChart(summary, platformRateChartData)
  ), [summary, platformRateChartData]);
  const shouldShowPlatformCheckChart = useMemo(() => (
    shouldRenderMetricChart(summary, platformCheckChartData)
  ), [summary, platformCheckChartData]);

  const metricColumns = [
    {
      title: '问题',
      key: 'question',
      width: 300,
      render: (_, row) => (
        <div style={{ wordBreak: 'break-word', lineHeight: 1.5 }}>
          {row?.prompt?.question || row?.questionRecord?.question || '-'}
        </div>
      ),
    },
    {
      title: '平台',
      dataIndex: 'platform',
      width: 110,
      render: (value) => <Tag>{platformLabel[value] || value || '未知'}</Tag>,
    },
    {
      title: '品牌提及',
      dataIndex: 'brand_mentioned',
      width: 100,
      render: (value) => value ? <Tag color="green">已提及</Tag> : <Tag>未提及</Tag>,
    },
    {
      title: '品牌次数',
      dataIndex: 'brand_mentions',
      width: 100,
      render: (value) => Number(value || 0),
    },
    {
      title: '声量占比（SOV）',
      dataIndex: 'share_of_voice',
      width: 100,
      render: (value) => `${percent(value)}%`,
    },
    {
      title: '排名/推荐',
      key: 'rank',
      width: 120,
      render: (_, row) => (
        <Space size={4}>
          <Tag>{row.brand_rank ? `第 ${row.brand_rank}` : '未上榜'}</Tag>
          {row.brand_recommended ? <Tag color="green">推荐</Tag> : null}
        </Space>
      ),
    },
    {
      title: '引用',
      key: 'citations',
      width: 120,
      render: (_, row) => Number(row.citation_count || 0) ? `${Number(row.citation_count || 0)} 条 / 自有 ${Number(row.owned_citation_count || 0)}` : '-',
    },
    {
      title: '分类',
      dataIndex: 'prompt_category',
      width: 110,
      render: (value) => value || '未分类',
    },
    {
      title: '情绪',
      dataIndex: 'sentiment',
      width: 100,
      render: (_, row) => {
        const display = getBrandSentimentDisplay(row);
        return <Tag color={display.sentimentColor}>{display.sentimentLabel}</Tag>;
      },
    },
    {
      title: '竞品提及',
      dataIndex: 'competitor_mentions',
      render: (items) => {
        const rows = Array.isArray(items) ? items.filter((item) => item?.mentioned || Number(item?.mentions || 0) > 0) : [];
        if (!rows.length) return <Text type="secondary">无</Text>;
        return (
          <Space wrap size={[4, 4]}>
            {rows.slice(0, 6).map((item, index) => (
              <Tag key={`${item?.name || 'competitor'}-${index}`}>{item?.name || '竞品'} {Number(item?.mentions || 0)}</Tag>
            ))}
          </Space>
        );
      },
    },
    {
      title: '时间',
      dataIndex: 'created_at',
      width: 170,
      render: formatDate,
    },
  ];

  const competitorColumns = [
    { title: '竞品', dataIndex: 'name' },
    { title: '提及次数', dataIndex: 'mentions', width: 120, render: (value) => Number(value || 0) },
    { title: '出现检查数', dataIndex: 'appeared_checks', width: 130, render: (value) => Number(value || 0) },
    { title: '可见度得分', dataIndex: 'visibility_score', width: 120, render: (value) => Number(value || 0) },
  ];

  const categoryColumns = [
    { title: '分类', dataIndex: 'category' },
    { title: 'Prompt 数', dataIndex: 'prompt_count', width: 100, render: (value) => Number(value || 0) },
    { title: '启用 Prompt', dataIndex: 'enabled_prompt_count', width: 110, render: (value) => Number(value || 0) },
    { title: '运行数', dataIndex: 'total_runs', width: 90, render: (value) => Number(value || 0) },
    { title: '失败数', dataIndex: 'failed_runs', width: 90, render: (value) => Number(value || 0) },
    { title: '失败率', dataIndex: 'failure_rate', width: 90, render: (value) => `${percent(value)}%` },
    { title: '有效分析', dataIndex: 'checks', width: 100, render: (value) => Number(value || 0) },
    { title: '提及率', dataIndex: 'brand_mention_rate', width: 100, render: (value) => `${percent(value)}%` },
    { title: '声量占比（SOV）', dataIndex: 'avg_share_of_voice', width: 140, render: (value) => `${percent(value)}%` },
    { title: '引用率', dataIndex: 'citation_rate', width: 100, render: (value) => `${percent(value)}%` },
    { title: '推荐率', dataIndex: 'recommendation_rate', width: 100, render: (value) => `${percent(value)}%` },
  ];

  const sourceTypeColumns = [
    {
      title: '类型',
      dataIndex: 'type',
      render: (value) => <Tag color={sourceTypeColor[value] || 'default'}>{value || '未知来源'}</Tag>
    },
    { title: '引用次数', dataIndex: 'citation_count', width: 100, render: (value) => Number(value || 0) },
    { title: '覆盖回答', dataIndex: 'response_count', width: 100, render: (value) => Number(value || 0) },
    { title: '域名数', dataIndex: 'domain_count', width: 90, render: (value) => Number(value || 0) },
  ];

  const sourceDomainColumns = [
    { title: '域名', dataIndex: 'domain', width: 220, ellipsis: true },
    {
      title: '类型',
      dataIndex: 'source_type',
      width: 110,
      render: (value) => <Tag color={sourceTypeColor[value] || 'default'}>{value || '未知来源'}</Tag>
    },
    { title: '引用次数', dataIndex: 'citation_count', width: 100, render: (value) => Number(value || 0) },
    { title: '覆盖回答', dataIndex: 'response_count', width: 100, render: (value) => Number(value || 0) },
    { title: '平台', dataIndex: 'platforms', width: 150, render: (value) => renderTags(value, platformLabel) },
    { title: 'Prompt 分类', dataIndex: 'categories', width: 180, render: (value) => renderTags(value) },
  ];

  const sourceChangeColumns = [
    { title: '域名', dataIndex: 'domain', width: 220, ellipsis: true },
    {
      title: '类型',
      dataIndex: 'source_type',
      width: 110,
      render: (value) => <Tag color={sourceTypeColor[value] || 'default'}>{value || '未知来源'}</Tag>
    },
    { title: '引用次数', dataIndex: 'citation_count', width: 100, render: (value) => Number(value || 0) },
    { title: '平台', dataIndex: 'platforms', width: 150, render: (value) => renderTags(value, platformLabel) },
    { title: 'Prompt 分类', dataIndex: 'categories', width: 180, render: (value) => renderTags(value) },
    { title: '最近出现', dataIndex: 'last_seen_at', width: 170, render: formatDate },
  ];

  const sourceUrlColumns = [
    {
      title: 'URL',
      dataIndex: 'url',
      width: 360,
      ellipsis: true,
      render: (value) => value ? <a href={value} target="_blank" rel="noreferrer">{value}</a> : '-'
    },
    { title: '域名', dataIndex: 'domain', width: 180, ellipsis: true },
    {
      title: '类型',
      dataIndex: 'source_type',
      width: 110,
      render: (value) => <Tag color={sourceTypeColor[value] || 'default'}>{value || '未知来源'}</Tag>
    },
    { title: '引用次数', dataIndex: 'citation_count', width: 100, render: (value) => Number(value || 0) },
    { title: '覆盖回答', dataIndex: 'response_count', width: 100, render: (value) => Number(value || 0) },
    { title: '平台', dataIndex: 'platforms', width: 150, render: (value) => renderTags(value, platformLabel) },
    { title: 'Prompt 分类', dataIndex: 'categories', width: 180, render: (value) => renderTags(value) },
  ];

  const opportunityColumns = [
    {
      title: '优先级',
      dataIndex: 'priority',
      width: 90,
      render: (value) => {
        const color = value === 'high' ? 'red' : value === 'medium' ? 'orange' : 'default';
        const label = value === 'high' ? '高' : value === 'medium' ? '中' : '低';
        return <Tag color={color}>{label}</Tag>;
      }
    },
    { title: '机会类型', dataIndex: 'type', width: 130, render: (value) => <Tag color="blue">{value || '机会'}</Tag> },
    {
      title: '平台/来源',
      key: 'scope',
      width: 130,
      render: (_, row) => formatOpportunityScope(row)
    },
    {
      title: '对象',
      key: 'target',
      width: 260,
      render: (_, row) => row.prompt || row.domain || row.competitor || row.prompt_category || '-'
    },
    { title: '证据', dataIndex: 'evidence', width: 300, render: (value) => value || '-' },
    { title: '建议动作', dataIndex: 'recommendation', render: (value) => value || '-' },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Space orientation="vertical" size={16} style={{ width: '100%' }}>
        <Row align="middle" justify="space-between" gutter={[16, 12]}>
          <Col>
            <Title level={3} style={{ margin: 0 }}>项目可见度看板</Title>
            <Text type="secondary">按周期查看中国大陆 GEO 项目表现</Text>
          </Col>
          <Col>
            <Space wrap>
              <Select
                loading={projectLoading}
                placeholder="选择品牌项目"
                style={{ width: 280 }}
                value={projectId}
                onChange={handleProjectChange}
                options={projects.map((item) => ({ label: item.name, value: item.id }))}
              />
              <Select
                style={{ width: 120 }}
                value={days}
                options={periodOptions}
                onChange={handleDaysChange}
              />
            </Space>
          </Col>
        </Row>

        {!projectLoading && !projects.length ? (
          <Alert type="info" showIcon title="暂无品牌项目" description="请先创建品牌项目后查看项目可见度看板。" />
        ) : null}

        <Row gutter={[12, 12]}>
          <Col xs={24} sm={12} lg={6}>
            <Card size="small"><Statistic title="总运行数" value={summary.total_runs ?? summary.total_checks ?? 0} loading={dashboardLoading} /></Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card size="small"><Statistic title="有效分析数" value={summary.total_checks || 0} loading={dashboardLoading} /></Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card size="small"><Statistic title="品牌提及率" value={percent(summary.brand_mention_rate)} suffix="%" loading={dashboardLoading} /></Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card size="small"><Statistic title="平均声量占比（SOV）" value={percent(summary.avg_share_of_voice)} suffix="%" loading={dashboardLoading} /></Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card size="small"><Statistic title="失败数" value={summary.failed_runs || 0} loading={dashboardLoading} /></Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card size="small"><Statistic title="竞品提及次数" value={competitors.reduce((sum, item) => sum + Number(item.mentions || 0), 0)} loading={dashboardLoading} /></Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card size="small"><Statistic title="引用率" value={percent(summary.citation_rate)} suffix="%" loading={dashboardLoading} /></Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card size="small"><Statistic title="自有来源覆盖率" value={percent(summary.owned_citation_rate)} suffix="%" loading={dashboardLoading} /></Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card size="small"><Statistic title="推荐率" value={percent(summary.recommendation_rate)} suffix="%" loading={dashboardLoading} /></Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card size="small"><Statistic title="平均品牌排名" value={formatRank(summary.avg_brand_rank)} loading={dashboardLoading} /></Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card size="small"><Statistic title="总引用来源" value={sourceSummary.total_citations || 0} loading={dashboardLoading} /></Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card size="small"><Statistic title="来源域名数" value={sourceSummary.source_domain_count || 0} loading={dashboardLoading} /></Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card size="small"><Statistic title="新增引用域名" value={newSourceDomains.length} loading={dashboardLoading} /></Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card size="small"><Statistic title="流失引用域名" value={droppedSourceDomains.length} loading={dashboardLoading} /></Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card size="small"><Statistic title="保留引用域名" value={retainedSourceDomains.length} loading={dashboardLoading} /></Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card size="small"><Statistic title="新增引用 URL" value={newSourceUrls.length} loading={dashboardLoading} /></Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card size="small"><Statistic title="流失引用 URL" value={droppedSourceUrls.length} loading={dashboardLoading} /></Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card size="small"><Statistic title="保留引用 URL" value={retainedSourceUrls.length} loading={dashboardLoading} /></Card>
          </Col>
        </Row>

        <Row gutter={[12, 12]}>
          <Col xs={24}>
            <Card size="small" title="优化机会" loading={dashboardLoading}>
              <Table
                size="small"
                rowKey={(row) => row.key || `${row.type}-${row.prompt_id || ''}-${row.platform || ''}-${row.domain || ''}-${row.competitor || ''}`}
                columns={opportunityColumns}
                dataSource={opportunities}
                pagination={{ pageSize: 6, showSizeChanger: false }}
                scroll={{ x: 1170 }}
                locale={{ emptyText: '暂无需要优先处理的优化机会' }}
              />
            </Card>
          </Col>
          <Col xs={24} xl={14}>
            <Card size="small" title="趋势" loading={dashboardLoading}>
              {shouldShowTrendChart ? (
                <Line
                  data={trendData}
                  xField="date"
                  yField="value"
                  seriesField="type"
                  height={280}
                  point
                  legend={{ position: 'top' }}
                />
              ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无趋势数据" />}
            </Card>
          </Col>
          <Col xs={24} xl={10}>
            <Card size="small" title="平台百分比指标" loading={dashboardLoading}>
              {shouldShowPlatformRateChart ? (
                <Column
                  data={platformRateChartData}
                  xField="platform"
                  yField="value"
                  seriesField="type"
                  isGroup
                  height={280}
                  legend={{ position: 'top' }}
                />
              ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无平台指标" />}
            </Card>
          </Col>
          <Col xs={24}>
            <Card size="small" title="平台有效分析数" loading={dashboardLoading}>
              {shouldShowPlatformCheckChart ? (
                <Column
                  data={platformCheckChartData}
                  xField="platform"
                  yField="checks"
                  height={220}
                  legend={false}
                />
              ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无平台数据" />}
            </Card>
          </Col>
          <Col xs={24}>
            <Card size="small" title="Prompt 库分类覆盖" loading={dashboardLoading}>
              <Table
                size="small"
                rowKey={(row) => row.category}
                columns={categoryColumns}
                dataSource={categories}
                pagination={false}
                locale={{ emptyText: '暂无分类数据' }}
              />
            </Card>
          </Col>
          <Col xs={24} xl={8}>
            <Card size="small" title="来源类型分布" loading={dashboardLoading}>
              <Table
                size="small"
                rowKey={(row) => row.type || 'unknown'}
                columns={sourceTypeColumns}
                dataSource={sourceTypes}
                pagination={false}
                locale={{ emptyText: '暂无来源类型' }}
              />
            </Card>
          </Col>
          <Col xs={24} xl={16}>
            <Card size="small" title="Top 引用域名" loading={dashboardLoading}>
              <Table
                size="small"
                rowKey={(row) => row.domain}
                columns={sourceDomainColumns}
                dataSource={sourceDomains}
                pagination={{ pageSize: 6, showSizeChanger: false }}
                scroll={{ x: 960 }}
                locale={{ emptyText: '暂无引用域名' }}
              />
            </Card>
          </Col>
          <Col xs={24} lg={8}>
            <Card size="small" title="新增引用域名" loading={dashboardLoading}>
              <Table
                size="small"
                rowKey={(row) => row.domain}
                columns={sourceChangeColumns}
                dataSource={newSourceDomains}
                pagination={{ pageSize: 6, showSizeChanger: false }}
                scroll={{ x: 930 }}
                locale={{ emptyText: '暂无新增引用域名' }}
              />
            </Card>
          </Col>
          <Col xs={24} lg={8}>
            <Card size="small" title="流失引用域名" loading={dashboardLoading}>
              <Table
                size="small"
                rowKey={(row) => row.domain}
                columns={sourceChangeColumns}
                dataSource={droppedSourceDomains}
                pagination={{ pageSize: 6, showSizeChanger: false }}
                scroll={{ x: 930 }}
                locale={{ emptyText: '暂无流失引用域名' }}
              />
            </Card>
          </Col>
          <Col xs={24} lg={8}>
            <Card size="small" title="保留引用域名" loading={dashboardLoading}>
              <Table
                size="small"
                rowKey={(row) => row.domain}
                columns={sourceChangeColumns}
                dataSource={retainedSourceDomains}
                pagination={{ pageSize: 6, showSizeChanger: false }}
                scroll={{ x: 930 }}
                locale={{ emptyText: '暂无保留引用域名' }}
              />
            </Card>
          </Col>
          <Col xs={24}>
            <Card size="small" title="Top 引用 URL" loading={dashboardLoading}>
              <Table
                size="small"
                rowKey={(row) => row.url || row.domain}
                columns={sourceUrlColumns}
                dataSource={sourceUrls}
                pagination={{ pageSize: 6, showSizeChanger: false }}
                scroll={{ x: 1180 }}
                locale={{ emptyText: '暂无引用 URL' }}
              />
            </Card>
          </Col>
        </Row>

        <Row gutter={[12, 12]}>
          <Col xs={24} xl={10}>
            <Card size="small" title="竞品提及" loading={dashboardLoading}>
              <Table
                size="small"
                rowKey={(row) => row.name}
                columns={competitorColumns}
                dataSource={competitors}
                pagination={false}
                locale={{ emptyText: '暂无竞品提及' }}
              />
            </Card>
          </Col>
          <Col xs={24} xl={14}>
            <Card size="small" title="最近指标" loading={dashboardLoading}>
              <Table
                size="small"
                rowKey={(row) => row.id}
                columns={metricColumns}
                dataSource={recentMetrics}
                pagination={{ pageSize: 8, showSizeChanger: false }}
                scroll={{ x: 1180 }}
              />
            </Card>
          </Col>
        </Row>
      </Space>
    </div>
  );
}

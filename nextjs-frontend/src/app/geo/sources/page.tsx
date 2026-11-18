// @ts-nocheck
'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, Col, Empty, Row, Select, Space, Statistic, Table, Tag, Typography, message } from 'antd';
import axios from 'axios';
import { Column } from '@ant-design/plots';
import { getSelectableProjects, resolveSelectedProjectId } from '@/utils/projectSelection.cjs';
import { normalizeSourceContextValues } from '@/utils/sourceDisplay.cjs';
import { getApiErrorMessage } from '@/utils/apiErrorMessage.cjs';

const { Text, Title } = Typography;

const platformLabel = {
  doubao: '豆包',
  deepseek: 'DeepSeek', qianwen: '千问', kimi: 'Kimi',
};

const typeColor = {
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

function formatDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('zh-CN', { hour12: false });
}

function renderTags(values, fallbackMap = {}) {
  const list = normalizeSourceContextValues(values);
  if (!list.length) return '-';
  return (
    <Space size={[4, 4]} wrap>
      {list.map((item) => <Tag key={item}>{fallbackMap[item] || item}</Tag>)}
    </Space>
  );
}

export default function GeoSourcesPage() {
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState();
  const [projectLoading, setProjectLoading] = useState(false);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sources, setSources] = useState(null);
  const [days, setDays] = useState(30);
  const sourceRequestRef = useRef(0);

  const invalidateSourceRequest = () => {
    sourceRequestRef.current += 1;
  };

  const handleProjectChange = (value) => {
    invalidateSourceRequest();
    setProjectId(value);
    setSources(null);
    setSourceLoading(false);
  };

  const handleDaysChange = (value) => {
    invalidateSourceRequest();
    setDays(value);
    setSources(null);
    setSourceLoading(false);
  };

  const fetchProjects = useCallback(async () => {
    setProjectLoading(true);
    try {
      const res = await axios.get('/api/geo-projects');
      const rows = getSelectableProjects(extractList(res));
      setProjects(rows);
      setProjectId((current) => resolveSelectedProjectId(rows, current));
    } catch (error) {
      message.error(getApiErrorMessage(error, '获取品牌项目失败'));
    } finally {
      setProjectLoading(false);
    }
  }, []);

  const fetchSources = useCallback(async (id, targetDays) => {
    const requestId = sourceRequestRef.current + 1;
    sourceRequestRef.current = requestId;
    if (!id) {
      setSources(null);
      setSourceLoading(false);
      return;
    }
    setSources(null);
    setSourceLoading(true);
    try {
      const res = await axios.get(`/api/geo-projects/${id}/sources`, { params: { days: targetDays } });
      if (sourceRequestRef.current === requestId) setSources(res?.data?.data || null);
    } catch (error) {
      if (sourceRequestRef.current === requestId) {
        message.error(getApiErrorMessage(error, '获取来源分析失败'));
      }
    } finally {
      if (sourceRequestRef.current === requestId) setSourceLoading(false);
    }
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);
  useEffect(() => { fetchSources(projectId, days); }, [projectId, days, fetchSources]);

  const selectedProject = useMemo(() => projects.find((item) => item.id === projectId), [projects, projectId]);
  const summary = sources?.summary || {};
  const sourceTypes = Array.isArray(sources?.source_types) ? sources.source_types : [];
  const domains = Array.isArray(sources?.domains) ? sources.domains : [];
  const urls = Array.isArray(sources?.urls) ? sources.urls : [];
  const opportunities = Array.isArray(sources?.opportunities) ? sources.opportunities : [];
  const records = Array.isArray(sources?.records) ? sources.records : [];
  const sourceChanges = sources?.source_changes || {};
  const newDomains = Array.isArray(sourceChanges?.new_domains) ? sourceChanges.new_domains : [];
  const droppedDomains = Array.isArray(sourceChanges?.dropped_domains) ? sourceChanges.dropped_domains : [];
  const retainedDomains = Array.isArray(sourceChanges?.retained_domains) ? sourceChanges.retained_domains : [];
  const newUrls = Array.isArray(sourceChanges?.new_urls) ? sourceChanges.new_urls : [];
  const droppedUrls = Array.isArray(sourceChanges?.dropped_urls) ? sourceChanges.dropped_urls : [];
  const retainedUrls = Array.isArray(sourceChanges?.retained_urls) ? sourceChanges.retained_urls : [];

  const sourceTypeChartData = sourceTypes.map((item) => ({
    type: item.type,
    citations: Number(item.citation_count || 0),
  }));

  const sourceTypeConfig = {
    data: sourceTypeChartData,
    xField: 'type',
    yField: 'citations',
    height: 260,
    autoFit: true,
    colorField: 'type',
    axis: { y: { title: '引用次数' } },
  };

  const domainColumns = [
    { title: '域名', dataIndex: 'domain', width: 220, ellipsis: true },
    {
      title: '类型',
      dataIndex: 'source_type',
      width: 110,
      render: (value) => <Tag color={typeColor[value] || 'default'}>{value || '未知来源'}</Tag>
    },
    { title: '引用次数', dataIndex: 'citation_count', width: 100, render: (value) => Number(value || 0), sorter: (a, b) => Number(a.citation_count || 0) - Number(b.citation_count || 0) },
    { title: '覆盖回答', dataIndex: 'response_count', width: 100, render: (value) => Number(value || 0) },
    { title: '平台', dataIndex: 'platforms', width: 150, render: (value) => renderTags(value, platformLabel) },
    { title: 'Prompt 分类', dataIndex: 'categories', width: 180, render: (value) => renderTags(value) },
  ];

  const urlColumns = [
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
      render: (value) => <Tag color={typeColor[value] || 'default'}>{value || '未知来源'}</Tag>
    },
    { title: '引用次数', dataIndex: 'citation_count', width: 100, render: (value) => Number(value || 0), sorter: (a, b) => Number(a.citation_count || 0) - Number(b.citation_count || 0) },
    { title: '平台', dataIndex: 'platforms', width: 150, render: (value) => renderTags(value, platformLabel) },
    { title: 'Prompt 分类', dataIndex: 'categories', width: 180, render: (value) => renderTags(value) },
  ];

  const sourceChangeColumns = [
    { title: '域名', dataIndex: 'domain', width: 220, ellipsis: true },
    {
      title: '类型',
      dataIndex: 'source_type',
      width: 110,
      render: (value) => <Tag color={typeColor[value] || 'default'}>{value || '未知来源'}</Tag>
    },
    { title: '引用次数', dataIndex: 'citation_count', width: 100, render: (value) => Number(value || 0) },
    { title: '平台', dataIndex: 'platforms', width: 150, render: (value) => renderTags(value, platformLabel) },
    { title: 'Prompt 分类', dataIndex: 'categories', width: 180, render: (value) => renderTags(value) },
    { title: '最近出现', dataIndex: 'last_seen_at', width: 180, render: formatDate },
  ];

  const sourceUrlChangeColumns = [
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
      render: (value) => <Tag color={typeColor[value] || 'default'}>{value || '未知来源'}</Tag>
    },
    { title: '引用次数', dataIndex: 'citation_count', width: 100, render: (value) => Number(value || 0) },
    { title: '平台', dataIndex: 'platforms', width: 150, render: (value) => renderTags(value, platformLabel) },
    { title: 'Prompt 分类', dataIndex: 'categories', width: 180, render: (value) => renderTags(value) },
    { title: '最近出现', dataIndex: 'last_seen_at', width: 180, render: formatDate },
  ];

  const opportunityColumns = [
    { title: '平台', dataIndex: 'platform', width: 110, render: (value) => platformLabel[value] || value || '-' },
    { title: 'Prompt 分类', dataIndex: 'prompt_category', width: 140, render: (value) => value || '未分类' },
    { title: '域名', dataIndex: 'domain', width: 180, ellipsis: true },
    {
      title: 'URL',
      dataIndex: 'url',
      width: 360,
      ellipsis: true,
      render: (value) => value ? <a href={value} target="_blank" rel="noreferrer">{value}</a> : '-'
    },
    { title: '时间', dataIndex: 'created_at', width: 180, render: formatDate },
  ];

  const recordColumns = [
    { title: '平台', dataIndex: 'platform', width: 110, render: (value) => platformLabel[value] || value || '-' },
    {
      title: '品牌提及',
      dataIndex: 'brand_mentioned',
      width: 100,
      render: (value) => <Tag color={value ? 'green' : 'default'}>{value ? '已提及' : '未提及'}</Tag>
    },
    {
      title: '来源类型',
      dataIndex: 'source_type',
      width: 110,
      render: (value) => <Tag color={typeColor[value] || 'default'}>{value || '未知来源'}</Tag>
    },
    { title: '域名', dataIndex: 'domain', width: 180, ellipsis: true },
    {
      title: 'URL',
      dataIndex: 'url',
      width: 360,
      ellipsis: true,
      render: (value) => value ? <a href={value} target="_blank" rel="noreferrer">{value}</a> : '-'
    },
    { title: '时间', dataIndex: 'created_at', width: 180, render: formatDate },
  ];

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <Card>
        <Row gutter={[12, 12]} align="middle" justify="space-between">
          <Col>
            <Title level={3} style={{ margin: 0 }}>来源分析</Title>
            <Text type="secondary">按周期查看 AI 回答引用来源、竞品来源缺口与可优化页面</Text>
          </Col>
          <Col>
            <Space wrap>
              <Select
                loading={projectLoading}
                  value={projectId}
                  style={{ width: 260 }}
                  placeholder="选择品牌项目"
                  onChange={handleProjectChange}
                  options={projects.map((item) => ({ value: item.id, label: item.name }))}
                />
              <Select
                  value={days}
                  style={{ width: 120 }}
                  options={periodOptions}
                  onChange={handleDaysChange}
                />
            </Space>
          </Col>
        </Row>
      </Card>

      {!projectLoading && !projects.length ? (
        <Card><Empty description="请先创建品牌项目后查看来源分析" /></Card>
      ) : null}

      <Row gutter={[12, 12]}>
        <Col xs={24} sm={12} lg={4}><Card size="small"><Statistic title="总引用" value={summary.total_citations || 0} loading={sourceLoading} /></Card></Col>
        <Col xs={24} sm={12} lg={4}><Card size="small"><Statistic title="有引用回答" value={summary.cited_responses || 0} loading={sourceLoading} /></Card></Col>
        <Col xs={24} sm={12} lg={4}><Card size="small"><Statistic title="来源域名" value={summary.source_domain_count || 0} loading={sourceLoading} /></Card></Col>
        <Col xs={24} sm={12} lg={4}><Card size="small"><Statistic title="自有来源" value={summary.owned_citations || 0} loading={sourceLoading} /></Card></Col>
        <Col xs={24} sm={12} lg={4}><Card size="small"><Statistic title="竞品来源" value={summary.competitor_citations || 0} loading={sourceLoading} /></Card></Col>
        <Col xs={24} sm={12} lg={4}><Card size="small"><Statistic title="第三方来源" value={summary.third_party_citations || 0} loading={sourceLoading} /></Card></Col>
      </Row>

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={10}>
          <Card size="small" title="来源类型分布" loading={sourceLoading}>
            {sourceTypeChartData.length ? <Column {...sourceTypeConfig} /> : <Empty description="暂无引用来源" />}
          </Card>
        </Col>
        <Col xs={24} lg={14}>
          <Card size="small" title="竞品来源缺口" loading={sourceLoading}>
            <Table
              rowKey={(row) => `${row.url}-${row.created_at}`}
              dataSource={opportunities}
              columns={opportunityColumns}
              size="small"
              scroll={{ x: 920 }}
              pagination={{ pageSize: 5, showSizeChanger: false }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={8}>
          <Card size="small" title="新增引用域名" loading={sourceLoading}>
            <Table
              rowKey="domain"
              dataSource={newDomains}
              columns={sourceChangeColumns}
              size="small"
              scroll={{ x: 940 }}
              pagination={{ pageSize: 5, showSizeChanger: false }}
            />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card size="small" title="流失引用域名" loading={sourceLoading}>
            <Table
              rowKey="domain"
              dataSource={droppedDomains}
              columns={sourceChangeColumns}
              size="small"
              scroll={{ x: 940 }}
              pagination={{ pageSize: 5, showSizeChanger: false }}
            />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card size="small" title="保留引用域名" loading={sourceLoading}>
            <Table
              rowKey="domain"
              dataSource={retainedDomains}
              columns={sourceChangeColumns}
              size="small"
              scroll={{ x: 940 }}
              pagination={{ pageSize: 5, showSizeChanger: false }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={8}>
          <Card size="small" title="新增引用 URL" loading={sourceLoading}>
            <Table
              rowKey="url"
              dataSource={newUrls}
              columns={sourceUrlChangeColumns}
              size="small"
              scroll={{ x: 1160 }}
              pagination={{ pageSize: 5, showSizeChanger: false }}
            />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card size="small" title="流失引用 URL" loading={sourceLoading}>
            <Table
              rowKey="url"
              dataSource={droppedUrls}
              columns={sourceUrlChangeColumns}
              size="small"
              scroll={{ x: 1160 }}
              pagination={{ pageSize: 5, showSizeChanger: false }}
            />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card size="small" title="保留引用 URL" loading={sourceLoading}>
            <Table
              rowKey="url"
              dataSource={retainedUrls}
              columns={sourceUrlChangeColumns}
              size="small"
              scroll={{ x: 1160 }}
              pagination={{ pageSize: 5, showSizeChanger: false }}
            />
          </Card>
        </Col>
      </Row>

      <Card size="small" title={`Top 来源域名${selectedProject?.name ? `：${selectedProject.name}` : ''}`} loading={sourceLoading}>
        <Table
          rowKey="domain"
          dataSource={domains}
          columns={domainColumns}
          size="small"
          scroll={{ x: 960 }}
          pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: [10, 20, 50] }}
        />
      </Card>

      <Card size="small" title="Top 引用 URL" loading={sourceLoading}>
        <Table
          rowKey="url"
          dataSource={urls}
          columns={urlColumns}
          size="small"
          scroll={{ x: 980 }}
          pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: [10, 20, 50] }}
        />
      </Card>

      <Card size="small" title="最近引用记录" loading={sourceLoading}>
        <Table
          rowKey={(row) => `${row.url}-${row.created_at}-${row.platform}`}
          dataSource={records}
          columns={recordColumns}
          size="small"
          scroll={{ x: 1040 }}
          pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: [10, 20, 50] }}
        />
      </Card>
    </Space>
  );
}

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import axios from 'axios';
import { Alert, Button, Card, Empty, Select, Skeleton, Space, Typography } from 'antd';
import { getApiErrorMessage } from '@/utils/apiErrorMessage.cjs';
import { MONITORING_PLATFORM_OPTIONS } from '@/utils/monitoringPlatforms.cjs';
import RankingTable from './RankingTable';
import type { BrandOption, MetricOption, RankingFilters, RankingResult } from './types';
import styles from './rankings.module.css';

const { Title, Text } = Typography;

export default function BrandRankingsPage() {
  const [projects, setProjects] = useState<BrandOption[]>([]);
  const [metrics, setMetrics] = useState<MetricOption[]>([]);
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [filters, setFilters] = useState<RankingFilters>({
    project_ids: [], days: 30, platform: MONITORING_PLATFORM_OPTIONS[0]?.value || 'deepseek',
    metric: 'brand_mention_rate', order: 'desc',
  });
  const [result, setResult] = useState<RankingResult | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState('');
  const calculation = useRef<AbortController | null>(null);

  const loadOptions = useCallback(async (signal: AbortSignal) => {
    setLoadingOptions(true);
    setError('');
    try {
      const response = await axios.get('/api/brand-rankings/options', { signal });
      if (signal.aborted) return;
      const data = response.data.data;
      setProjects(data.projects);
      setMetrics(data.metrics);
      setPlatforms(data.platforms);
      setFilters((current) => ({ ...current,
        platform: data.platforms.includes(current.platform) ? current.platform : data.platforms[0],
        project_ids: current.project_ids.filter((id) => data.projects.some((project: BrandOption) => project.id === id)),
      }));
    } catch (failure) {
      if (!signal.aborted) setError(getApiErrorMessage(failure, '获取可排名品牌失败'));
    } finally {
      if (!signal.aborted) setLoadingOptions(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadOptions(controller.signal);
    return () => { controller.abort(); calculation.current?.abort(); };
  }, [loadOptions]);

  const updateFilters = (patch: Partial<RankingFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setResult(null);
    setError('');
  };

  const calculate = async () => {
    const controller = new AbortController();
    calculation.current?.abort();
    calculation.current = controller;
    setCalculating(true);
    setResult(null);
    setError('');
    try {
      const response = await axios.post('/api/brand-rankings/calculate', filters, { signal: controller.signal });
      if (!controller.signal.aborted) setResult(response.data.data);
    } catch (failure) {
      if (!controller.signal.aborted) setError(getApiErrorMessage(failure, '计算品牌排名失败'));
    } finally {
      if (!controller.signal.aborted) setCalculating(false);
    }
  };

  const platformOptions = MONITORING_PLATFORM_OPTIONS.filter((item) => platforms.includes(item.value));
  const selectable = projects.filter((project) => project.platforms.includes(filters.platform));
  const selectedMetric = metrics.find((item) => item.value === filters.metric);

  return <div className={styles.page}>
    <div className={styles.heading}>
      <div>
        <Title level={1} style={{ fontSize: 24 }}>品牌排名</Title>
        <Text type="secondary">对比多个品牌在同一报告周期、同一平台的表现</Text>
      </div>
      <Link href="/geo/reports">返回报告中心</Link>
    </div>
    {error && <Alert type="error" showIcon title={error}
      action={!projects.length && <Button onClick={() => loadOptions(new AbortController().signal)}>重试</Button>} />}
    <Card title="排名条件">
      {loadingOptions ? <Skeleton active paragraph={{ rows: 4 }} /> : <>
        <div className={styles.filters}>
          <div className={`${styles.field} ${styles.brands}`}>
            <div className={styles.fieldLabel}>
              <label htmlFor="ranking-brands">参与排名的品牌</label>
              <Space>
                <Button type="link" size="small" disabled={calculating || !selectable.length}
                  onClick={() => updateFilters({ project_ids: selectable.slice(0, 50).map((project) => project.id) })}>选择该平台品牌（最多 50 个）</Button>
                <Text type="secondary">已选 {filters.project_ids.length} / 50</Text>
              </Space>
            </div>
            <Select id="ranking-brands" mode="multiple" allowClear showSearch optionFilterProp="label"
              placeholder="选择已有有效分析数据的品牌" value={filters.project_ids} disabled={calculating}
              maxCount={50} maxTagCount="responsive"
              onChange={(project_ids: number[]) => updateFilters({ project_ids })}
              options={projects.map((project) => ({ value: project.id, label: project.name }))} />
          </div>
          <div className={styles.field}>
            <label htmlFor="ranking-period">报告周期</label>
            <Select id="ranking-period" value={filters.days} disabled={calculating}
              onChange={(days) => updateFilters({ days })}
              options={[7, 30, 90].map((days) => ({ value: days, label: `近 ${days} 天` }))} />
          </div>
          <div className={styles.field}>
            <label htmlFor="ranking-platform">监测平台</label>
            <Select id="ranking-platform" value={filters.platform} disabled={calculating}
              options={platformOptions} onChange={(platform) => updateFilters({ platform })} />
          </div>
          <div className={styles.field}>
            <label htmlFor="ranking-metric">排序指标</label>
            <Select id="ranking-metric" value={filters.metric} disabled={calculating} options={metrics}
              onChange={(metric) => updateFilters({ metric, order: metrics.find((item) => item.value === metric)?.default_order || 'desc' })} />
          </div>
          <div className={styles.field}>
            <label htmlFor="ranking-order">排序方向</label>
            <Select id="ranking-order" value={filters.order} disabled={calculating}
              onChange={(order) => updateFilters({ order })}
              options={[{ value: 'desc', label: '从高到低' }, { value: 'asc', label: '从低到高' }]} />
          </div>
        </div>
        <div className={styles.actions}>
          <Text type="secondary">自动补生成缺失或过期的报告；仅汇总已有分析，不执行新的 AI 检测。</Text>
          <Button type="primary" loading={calculating} disabled={!filters.project_ids.length || !platforms.length} onClick={calculate}>
            {calculating ? '正在准备报告并计算排名' : '计算排名'}
          </Button>
        </div>
      </>}
    </Card>
    <Card title="排名结果" aria-busy={calculating}>
      {calculating ? <div role="status"><Text>正在检查报告并计算排名，请稍候…</Text><Skeleton active paragraph={{ rows: 5 }} /></div>
        : result ? <>
          <div className={styles.resultMeta} role="status">
            <Text strong>近 {result.filters.days} 天 · {platformOptions.find((item) => item.value === result.filters.platform)?.label} · {selectedMetric?.label}（{result.filters.order === 'desc' ? '从高到低' : '从低到高'}）</Text>
            <Text>参与排名 {result.ranked_count} / {result.rows.length} 个品牌 · 自动生成 {result.generated_count} 份报告</Text>
            <Text type="secondary">计算时间：{new Date(result.calculated_at).toLocaleString('zh-CN', { hour12: false })}</Text>
          </div>
          <RankingTable result={result} metrics={metrics} />
          <Text type="secondary">指标值相同则并列，后续名次跳号；缺少有效数据的品牌不参与排名。各品牌的有效分析数可能不同，可结合样本量解读结果。</Text>
        </> : <Empty description={projects.length ? '选择品牌及条件后，点击「计算排名」查看结果' : '暂无可排名的品牌，请先在品牌项目中运行分析'} />}
    </Card>
  </div>;
}

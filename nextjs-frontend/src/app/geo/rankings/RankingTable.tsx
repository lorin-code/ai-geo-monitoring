'use client';

import Link from 'next/link';
import { Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { MetricOption, RankingResult, RankingRow } from './types';
import styles from './rankings.module.css';

export default function RankingTable({ result, metrics }: { result: RankingResult; metrics: MetricOption[] }) {
  const columns: ColumnsType<RankingRow> = [
    {
      title: '名次', dataIndex: 'rank', width: 80, fixed: 'left',
      render: (rank: number | null) => rank === null ? '—' : <Tag color={rank <= 3 ? 'gold' : undefined}>{rank}</Tag>,
    },
    {
      title: '品牌项目', dataIndex: 'name', width: 210,
      render: (name: string, row) => <div>
        <Typography.Text strong>{name}</Typography.Text>
        {row.reason && <div className={styles.reason}>{row.reason}</div>}
      </div>,
    },
    { title: '有效分析数', dataIndex: 'checks', width: 110 },
    ...metrics.map((metric): ColumnsType<RankingRow>[number] => ({
      title: `${metric.label}${result.filters.metric === metric.value ? ' · 排序依据' : ''}`,
      key: metric.value, width: metric.value === 'avg_share_of_voice' ? 210 : 160, align: 'right',
      render: (_: unknown, row: RankingRow) => {
        const value = row.metrics[metric.value];
        return <Typography.Text strong={result.filters.metric === metric.value}>
          {value === null || value === undefined ? '—' : `${value.toFixed(2)}${metric.unit}`}
        </Typography.Text>;
      },
    })),
    {
      title: '报告', key: 'report', width: 200,
      render: (_: unknown, row) => row.report ? <div>
        <Link href={`/geo/reports?projectId=${row.project_id}&days=${result.filters.days}`}>查看项目报告</Link>
        <div className={styles.reason}>
          {row.generated ? '本次自动生成' : '使用已有报告'} · #{row.report.id}
        </div>
        <Typography.Text type="secondary">{new Date(row.report.created_at).toLocaleString('zh-CN', { hour12: false })}</Typography.Text>
      </div> : <Tag color={row.status === 'error' ? 'error' : undefined}>{row.status === 'error' ? '生成失败' : '暂无有效数据'}</Tag>,
    },
  ];
  return <Table<RankingRow> rowKey="project_id" columns={columns} dataSource={result.rows}
    scroll={{ x: 1400 }} pagination={{ pageSize: 20, showSizeChanger: false, hideOnSinglePage: true }} />;
}

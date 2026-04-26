'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Card, Table, Space, Button, Input, Select, Tag, message } from 'antd';
import axios from 'axios';

export default function AdminHistoryPage() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('agd_token') || '' : '';

  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [userId, setUserId] = useState('');
  const [platform, setPlatform] = useState('');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');

  const fetchHistory = async (p = page, l = limit) => {
    try {
      setLoading(true);
      const params: Record<string, any> = { page: p, limit: l };
      if (userId) params.user_id = userId;
      if (platform) params.platform = platform;
      if (status) params.status = status;
      if (q) params.q = q;
      const res = await axios.get('/api/detection/history', { params });
      if (res.data?.success) {
        const data = res.data?.data || {};
        const rows = Array.isArray(data.records) ? data.records : [];
        const countKeywordOccurrences = (text: any, keywords: any, englishWordBoundary = true) => {
          const s = typeof text === 'string' ? text : String(text || '');
          const list = Array.isArray(keywords) ? keywords.filter(Boolean) : [];
          const escape = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          return list.map((kw) => {
            const e = escape(String(kw));
            const useBoundary = englishWordBoundary && /^[A-Za-z]+$/.test(String(kw));
            const re = new RegExp(useBoundary ? `\\b${e}\\b` : e, 'gi');
            let c = 0;
            for (const _ of s.matchAll(re)) c += 1;
            return { keyword: String(kw), count: c };
          });
        };
        const mapped = rows.map((r: any) => {
          const brandKeywords = typeof r.brand_keywords === 'string'
            ? r.brand_keywords.split(/[,，]/).map((s: string) => s.trim()).filter(Boolean)
            : Array.isArray(r.brand_keywords) ? r.brand_keywords : [];
          const originalText = r.resultDetail?.ai_response_original || '';
          const keywordStatsRaw = Array.isArray(r.result_summary?.keyword_counts) && r.result_summary.keyword_counts.length > 0
            ? r.result_summary.keyword_counts
            : countKeywordOccurrences(originalText, brandKeywords, true);
          const keywordStats = Array.isArray(brandKeywords)
            ? brandKeywords.map((kw) => {
                const hit = (Array.isArray(keywordStatsRaw) ? keywordStatsRaw : []).find((s) => s.keyword === kw);
                return { keyword: String(kw), count: Number(hit?.count || 0) };
              })
            : (Array.isArray(keywordStatsRaw) ? keywordStatsRaw : []);
          return {
            ...r,
            brandKeywords,
            keywordStats,
          };
        });
        setRecords(mapped);
        setTotal(data.total || 0);
      } else {
        message.error(res.data?.message || '获取历史失败');
      }
    } catch (e: any) {
      if (e?.response?.status === 401) message.error('未授权：请重新登录');
      else if (e?.response?.status === 403) message.error('禁止访问：需要管理员权限');
      else message.error('获取历史失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory(1, limit);
  }, []);

  const PLATFORM_LABELS = useMemo(() => ({ doubao: '豆包', deepseek: 'DeepSeek', kimi: 'Kimi', qianwen: '千问' }), []);

  const columns = useMemo(() => [
    { title: '检测时间', dataIndex: 'created_at', key: 'created_at', width: 160, render: (t: any) => {
      if (!t) return '-';
      const d = new Date(t);
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } },
    { title: '问题', dataIndex: 'question', key: 'question', ellipsis: true, width: 380 },
    { title: '平台', dataIndex: 'platform', key: 'platform', width: 120, render: (p: any) => (
      <Tag color="processing">{PLATFORM_LABELS[p as keyof typeof PLATFORM_LABELS] || String(p || '-')}</Tag>
    ) },
    { title: '状态', dataIndex: 'status', key: 'status', width: 110, render: (s: any) => (
      <Tag color={s === 'completed' ? 'success' : s === 'failed' ? 'error' : 'processing'}>
        {s === 'completed' ? '已完成' : s === 'failed' ? '失败' : '进行中'}
      </Tag>
    ) },
    { title: '用户名', dataIndex: ['user', 'username'], key: 'username', width: 160 },
    { title: '关键词统计', key: 'keywordStats', width: 240, render: (_: any, record: any) => {
      const list = Array.isArray(record.keywordStats) ? record.keywordStats : [];
      if (!list.length) return <span>-</span>;
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxWidth: '100%' }}>
          {list.map((k: any, idx: number) => (
            <Tag key={`${k.keyword}-${idx}`} color="warning">{`${k.keyword} × ${k.count}`}</Tag>
          ))}
        </div>
      );
    } },
  ], [PLATFORM_LABELS]);

  return (
    <Card
      title={(
        <Space wrap size="small" style={{ maxWidth: '100%' }}>
          <Input
            size="small"
            placeholder="按问题关键词搜索"
            allowClear
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onPressEnter={() => { setPage(1); fetchHistory(1, limit); }}
            style={{ width: 220, maxWidth: '100%' }}
          />
          <Select
            size="small"
            placeholder="平台筛选"
            allowClear
            value={platform}
            onChange={setPlatform}
            options={['doubao','deepseek','kimi','qianwen'].map(v => ({ value: v, label: PLATFORM_LABELS[v as keyof typeof PLATFORM_LABELS] || v }))}
            style={{ width: 140, maxWidth: '100%' }}
          />
          <Select
            size="small"
            placeholder="状态筛选"
            allowClear
            value={status}
            onChange={setStatus}
            options={[{ value: 'pending', label: '进行中' }, { value: 'completed', label: '完成' }, { value: 'failed', label: '失败' }]}
            style={{ width: 120, maxWidth: '100%' }}
          />
          <Input
            size="small"
            placeholder="按用户ID筛选"
            allowClear
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            onPressEnter={() => { setPage(1); fetchHistory(1, limit); }}
            style={{ width: 140, maxWidth: '100%' }}
          />
          <Button size="small" type="primary" onClick={() => { setPage(1); fetchHistory(1, limit); }}>搜索</Button>
          <Button size="small" onClick={() => { setUserId(''); setPlatform(''); setStatus(''); setQ(''); setPage(1); fetchHistory(1, limit); }}>重置</Button>
        </Space>
      )}
    >
      <Table
        rowKey="id"
        loading={loading}
        dataSource={records}
        columns={columns}
        pagination={{
          current: page,
          pageSize: limit,
          total,
          onChange: (p, l) => { setPage(p); setLimit(l); fetchHistory(p, l); },
        }}
      />
    </Card>
  );
}

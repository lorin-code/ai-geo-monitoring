// @ts-nocheck
'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Card, Table, Space, Button, Tag, Input, Select, DatePicker, Modal, message, Popconfirm, Descriptions } from 'antd';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkKeywordHighlight from '@/utils/remarkKeywordHighlight';
import axios from 'axios';
import { sequentialWithDelay } from '@/utils/concurrentLimit';
import { CameraOutlined } from '@ant-design/icons';
import { toPng } from 'html-to-image';

const { RangePicker } = DatePicker;
const platformOptions = [
  { value: 'doubao', label: '豆包' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'kimi', label: 'Kimi' },
  { value: 'qianwen', label: '千问' }
];

const formatDateTimeShort = (v) => {
  try {
    const d = new Date(v);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${dd} ${hh}:${mm}`;
  } catch {
    return String(v || '-');
  }
};

export default function GeoHistoryPage() {
  const userId = Number(typeof window !== 'undefined' ? localStorage.getItem('agd_user_id') || 0 : 0);
  const token = typeof window !== 'undefined' ? localStorage.getItem('agd_token') || '' : '';

  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [q, setQ] = useState('');
  const [brand, setBrand] = useState('');
  const [platform, setPlatform] = useState();
  const [status, setStatus] = useState();
  const [brandOptions, setBrandOptions] = useState([]);

  const [detailOpen, setDetailOpen] = useState(false);
  const [current, setCurrent] = useState(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const detailRef = useRef(null);
  const scrollRef = useRef(null);

  const fetchHistory = useCallback(async (opts = {}) => {
    setLoading(true);
    try {
      const params = {
        page: opts.page != null ? opts.page : page,
        limit: opts.limit != null ? opts.limit : limit,
        platform: opts.platform != null ? opts.platform : platform,
        status: opts.status != null ? opts.status : status,
        q: opts.q != null ? opts.q : q,
        brand: opts.brand != null ? opts.brand : brand,
      };
      const res = await axios.get(`/api/detection/history/${userId}`, { params });
      const data = res?.data?.data || {};
      setTotal(data.total || 0);
      // 统计关键词出现次数（英文关键词使用词边界）
      const countKeywordOccurrences = (text, keywords, englishWordBoundary = true) => {
        const s = typeof text === 'string' ? text : String(text || '');
        const list = Array.isArray(keywords) ? keywords.filter(Boolean) : [];
        const escape = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return list.map((kw) => {
          const e = escape(String(kw));
          const useBoundary = englishWordBoundary && /^[A-Za-z]+$/.test(String(kw));
          const re = new RegExp(useBoundary ? `\b${e}\b` : e, 'gi');
          const c = [...s.matchAll(re)].length;
          return { keyword: String(kw), count: c };
        });
      };

      setRecords((data.records || []).map(r => {
        const brandKeywords = typeof r.brand_keywords === 'string'
          ? r.brand_keywords.split(/[,，]/).map(s => s.trim()).filter(Boolean)
          : Array.isArray(r.brand_keywords) ? r.brand_keywords : [];
        const originalText = r.resultDetail?.ai_response_original || '';
        const keywordStatsRaw = Array.isArray(r.result_summary?.keyword_counts) && r.result_summary.keyword_counts.length > 0
          ? r.result_summary.keyword_counts
          : countKeywordOccurrences(originalText, brandKeywords, true);
        // 合并关键词，保证每个检测关键词都有统计项（即便为 0 次）
        const keywordStats = Array.isArray(brandKeywords)
          ? brandKeywords.map((kw) => {
            const hit = (Array.isArray(keywordStatsRaw) ? keywordStatsRaw : []).find((s) => s.keyword === kw);
            return { keyword: String(kw), count: Number(hit?.count || 0) };
          })
          : (Array.isArray(keywordStatsRaw) ? keywordStatsRaw : []);
        return {
          id: r.id,
          brand: r.brand,
          platform: r.platform,
          question: r.question,
          status: r.status,
          created_at: r.created_at,
          resultDetail: r.resultDetail || {},
          brandKeywords,
          keywordStats,
          error_message: r.error_message || ''
        };
      }));
    } catch {
      message.error('获取历史记录失败');
    } finally {
      setLoading(false);
    }
  }, [platform, status, q, brand, userId]);

  useEffect(() => {
    fetchHistory({ page: 1 });
    // 获取品牌列表
    axios.get('/api/detection/brands').then(res => {
      if (res.data?.success && Array.isArray(res.data.data)) {
        setBrandOptions(res.data.data.map(b => ({ label: b, value: b })));
      }
    }).catch(console.error);
  }, []);

  // 过滤条件变化后同步搜索（首屏已加载后再触发）
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      return;
    }
    setPage(1);
    fetchHistory({ page: 1 });
  }, [q, platform, status, brand, fetchHistory]);

  // 监听 page 和 limit 变化，触发数据加载
  const pageLimitInitializedRef = useRef(false);
  useEffect(() => {
    // 避免初始加载时重复请求
    if (!pageLimitInitializedRef.current) {
      pageLimitInitializedRef.current = true;
      return;
    }
    if (page > 0 && limit > 0) {
      fetchHistory({ page, limit });
    }
  }, [page, limit, fetchHistory]);

  const openDetail = (record) => {
    setCurrent(record);
    setDetailOpen(true);
  };

  const deleteRecord = async (recordId) => {
    try {
      await axios.delete(`/api/detection/record/${recordId}`);
      message.success('记录已删除');
      fetchHistory({ page });
    } catch {
      message.error('删除失败');
    }
  };

  const deleteSelected = async () => {
    if (!selectedRowKeys.length) {
      message.warning('请先选择要删除的记录');
      return;
    }
    try {
      await sequentialWithDelay(selectedRowKeys, async (id) => {
        await axios.delete(`/api/detection/record/${id}`);
      }, 100);
      message.success(`已删除 ${selectedRowKeys.length} 条选中记录`);
      setSelectedRowKeys([]);
      fetchHistory({ page });
    } catch {
      message.error('删除选中失败');
    }
  };

  const exportHistory = () => {
    try {
      const PLATFORM_LABELS = { doubao: '豆包', deepseek: 'DeepSeek', kimi: 'Kimi', qianwen: '千问' };
      const STATUS_LABELS = { pending: '进行中', completed: '已完成', failed: '失败' };
      const wrapCsv = (val) => {
        const s = val == null ? '' : String(val);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      };
      const header = ['检测时间', '问题', '平台', '状态', '关键词统计'];
      const rows = (Array.isArray(records) ? records : []).map((item) => {
        const time = formatDateTimeShort(item.created_at);
        const platformLabel = PLATFORM_LABELS[item.platform] || String(item.platform || '');
        const statusLabel = STATUS_LABELS[item.status] || String(item.status || '');
        const keywordStats = Array.isArray(item.keywordStats) && item.keywordStats.length > 0
          ? item.keywordStats.map(s => `${s.keyword} × ${s.count}`).join('；')
          : '';
        return [wrapCsv(time), wrapCsv(item.question || ''), wrapCsv(platformLabel), wrapCsv(statusLabel), wrapCsv(keywordStats)].join(',');
      });
      const csv = [header.join(','), ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'history_export.csv';
      link.click();
      message.success('历史记录已导出');
    } catch {
      message.error('导出失败');
    }
  };

  const exportDetailImage = async () => {
    try {
      // 仅导出内容区域，不包含标题栏与底部按钮
      const node = scrollRef.current || detailRef.current;
      if (!node) {
        message.warning('当前内容不可导出');
        return;
      }
      const prevMaxHeight = node.style.maxHeight;
      const prevOverflowY = node.style.overflowY;
      node.style.maxHeight = 'none';
      node.style.overflowY = 'visible';
      await new Promise((resolve) => setTimeout(resolve, 0));
      const dataUrl = await toPng(node, { cacheBust: true, backgroundColor: '#fff' });
      node.style.maxHeight = prevMaxHeight;
      node.style.overflowY = prevOverflowY;
      const link = document.createElement('a');
      const platformPart = current?.platform ? `_${current.platform}` : '';
      link.href = dataUrl;
      link.download = `history_detail${platformPart}_${Date.now()}.png`;
      link.click();
      message.success('已导出图片');
    } catch {
      message.error('导出失败');
    }
  };

  const PLATFORM_LABELS = { doubao: '豆包', deepseek: 'DeepSeek', kimi: 'Kimi', qianwen: '千问' };
  const columns = [
    { title: '检测时间', dataIndex: 'created_at', width: 160, render: (v) => formatDateTimeShort(v) },
    { title: '问题', dataIndex: 'question', ellipsis: true, width: 380 },
    { title: '品牌', dataIndex: 'brand', width: 120, ellipsis: true, render: (t) => t || '-' },
    {
      title: '平台', dataIndex: 'platform', width: 120, render: (p) => (
        <Tag color="processing">{PLATFORM_LABELS[p] || String(p || '-')}</Tag>
      )
    },
    {
      title: '状态', dataIndex: 'status', width: 110, render: (s) => (
        <Tag color={s === 'completed' ? 'success' : s === 'failed' ? 'error' : 'processing'}>
          {s === 'completed' ? '已完成' : s === 'failed' ? '失败' : '进行中'}
        </Tag>
      )
    },
    ...(status === 'failed' ? [{
      title: '失败原因', dataIndex: 'error_message', width: 260, render: (msg, record) => (
        record.status === 'failed'
          ? (msg ? <span style={{ color: '#cf1322' }}>{msg}</span> : <span style={{ color: '#999' }}>-</span>)
          : null
      )
    }] : []),
    {
      title: '关键词统计', key: 'keywordStats', width: 240, render: (_, record) => {
        const list = Array.isArray(record.keywordStats) ? record.keywordStats : [];
        if (!list.length) return <span>-</span>;
        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxWidth: '100%' }}>
            {list.map((k, idx) => (
              <Tag key={`${k.keyword}-${idx}`} color="warning">{`${k.keyword} × ${k.count}`}</Tag>
            ))}
          </div>
        );
      }
    },
    {
      title: '操作', key: 'actions', width: 180, render: (_, record) => (
        <Space>
          <Button size="small" onClick={() => openDetail(record)}>详情</Button>
          <Popconfirm title="确认删除该记录？" onConfirm={() => deleteRecord(record.id)}>
            <Button danger size="small">删除</Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

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
            onPressEnter={() => fetchHistory({ page: 1 })}
            style={{ width: 220, maxWidth: '100%' }}
          />
          <Select
            size="small"
            placeholder="按品牌筛选"
            allowClear
            showSearch
            value={brand}
            onChange={(v) => setBrand(v)}
            options={brandOptions}
            style={{ width: 140, maxWidth: '100%' }}
          />
          <Select
            size="small"
            placeholder="平台筛选"
            allowClear
            value={platform}
            onChange={(v) => setPlatform(v)}
            options={platformOptions}
            style={{ width: 140, maxWidth: '100%' }}
          />
          <Select
            size="small"
            placeholder="状态筛选"
            allowClear
            value={status}
            onChange={(v) => setStatus(v)}
            options={[{ value: 'pending', label: '进行中' }, { value: 'completed', label: '完成' }, { value: 'failed', label: '失败' }]}
            style={{ width: 120, maxWidth: '100%' }}
          />
          <Button size="small" onClick={exportHistory}>导出</Button>
          <Popconfirm title="确认删除选中的记录？" onConfirm={deleteSelected}>
            <Button size="small" danger disabled={!selectedRowKeys.length}>删除选中</Button>
          </Popconfirm>
        </Space>
      )}
      styles={{ header: { alignItems: 'flex-start' } }}
    >
      <Table
        rowKey="id"
        loading={loading}
        dataSource={records}
        columns={columns}
        size="small"
        tableLayout="fixed"
        scroll={{ x: 'max-content', y: 480 }}
        rowSelection={{
          selectedRowKeys,
          onChange: (keys) => setSelectedRowKeys(keys)
        }}
        pagination={{ current: page, pageSize: limit, total, onChange: (p, l) => { setPage(p); setLimit(l); } }}
      />

      <Modal
        title={(
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>历史记录详情</span>
            <Button size="small" icon={<CameraOutlined />} onClick={exportDetailImage} style={{ marginRight: 40 }}>导出图片</Button>
          </div>
        )}
        open={detailOpen}
        onCancel={() => setDetailOpen(false)}
        footer={<Button onClick={() => setDetailOpen(false)}>关闭</Button>}
        width={800}
        centered
        modalRender={(node) => (<div ref={detailRef}>{node}</div>)}
      >
        {current ? (
          <>
            <div ref={scrollRef} style={{ background: '#fff', padding: 8, maxHeight: '70vh', overflowY: 'auto' }}>
              <Descriptions bordered column={2} size="small" styles={{ label: { whiteSpace: 'nowrap', width: 90 } }}>
                <Descriptions.Item label="检测时间">{formatDateTimeShort(current.created_at)}</Descriptions.Item>
                <Descriptions.Item label="状态">
                  <Tag color={current.status === 'completed' ? 'success' : current.status === 'failed' ? 'error' : 'processing'}>
                    {current.status === 'completed' ? '已完成' : current.status === '失败' ? '失败' : '进行中'}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="问题" span={1}>
                  <div style={{ wordBreak: 'break-word' }}>{current.question || '-'}</div>
                </Descriptions.Item>
                <Descriptions.Item label="检测关键词" span={1}>
                  {Array.isArray(current.brandKeywords) && current.brandKeywords.length ? (
                    <Space wrap size="small">
                      {current.brandKeywords.map((kw, idx) => (
                        <Tag key={`${kw}-${idx}`} color="blue">{kw}</Tag>
                      ))}
                    </Space>
                  ) : (
                    <span>-</span>
                  )}
                </Descriptions.Item>
                <Descriptions.Item label="品牌" span={1}>
                  {current.brand || '-'}
                </Descriptions.Item>
                <Descriptions.Item label="检测平台" span={1}>
                  <Tag color="processing">{PLATFORM_LABELS[current.platform] || String(current.platform || '-')}</Tag>
                </Descriptions.Item>
                {current.status === 'failed' && (
                  <Descriptions.Item label="失败原因" span={2}>
                    <div style={{ whiteSpace: 'pre-wrap', color: '#cf1322' }}>{current.error_message || '-'}</div>
                  </Descriptions.Item>
                )}
                <Descriptions.Item label="关键词统计" span={1}>
                  {Array.isArray(current.keywordStats) && current.keywordStats.length ? (
                    <Space wrap size="small">
                      {current.keywordStats.map((k, idx) => (
                        <Tag key={`${k.keyword}-${idx}`} color="gold">{`${k.keyword} × ${k.count}`}</Tag>
                      ))}
                    </Space>
                  ) : (
                    <span>-</span>
                  )}
                </Descriptions.Item>

                {current.resultDetail?.parsing_error && (
                  <Descriptions.Item label="解析错误" span={2}>
                    <div style={{ whiteSpace: 'pre-wrap', color: 'red' }}>{current.resultDetail.parsing_error}</div>
                  </Descriptions.Item>
                )}
              </Descriptions>
              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 500, color: '#1f1f1f', marginBottom: 8, textAlign: 'center' }}>AI 原文</div>
                <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 12, lineHeight: 1.7, overflow: 'visible' }}>
                  {current.resultDetail?.ai_response_original ? (
                    <ReactMarkdown
                      remarkPlugins={[
                        remarkGfm,
                        [remarkKeywordHighlight, { keywords: Array.isArray(current.brandKeywords) ? current.brandKeywords : [], englishWordBoundary: true }]
                      ]}
                      components={{
                        em: ({ children }) => (
                          <mark style={{ backgroundColor: '#fff3a1' }}>{children}</mark>
                        )
                      }}
                    >
                      {String(current.resultDetail.ai_response_original || '')}
                    </ReactMarkdown>
                  ) : (
                    <span>-</span>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div>未选择记录</div>
        )}
      </Modal>
    </Card>
  );
}

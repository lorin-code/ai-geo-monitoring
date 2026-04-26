// @ts-nocheck
'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Table, Space, Tag, Progress, message, Card, Row, Col, Statistic, Select, DatePicker, Input, Divider, Alert, Button } from 'antd';
import axios from 'axios';
import { Line, Column, Pie } from '@ant-design/plots';

export default function GeoDashboardPage() {
  const rawUserId = Number(typeof window !== 'undefined' ? localStorage.getItem('agd_user_id') || 0 : 0);
  // 未登录场景下回退到演示用户（ID=1），避免图表无数据
  const userId = rawUserId && rawUserId > 0 ? rawUserId : 1;
  const isDemoUser = !(rawUserId && rawUserId > 0);

  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState([]);

  const [selectedPlatforms, setSelectedPlatforms] = useState([]);
  const [dateRange, setDateRange] = useState([]);
  const [keywordQuery, setKeywordQuery] = useState('');
  const [trendMetric, setTrendMetric] = useState('both');
  const [trendGroup, setTrendGroup] = useState('day');
  const [selectedTrendKeywords, setSelectedTrendKeywords] = useState([]);
  const [platformMetric, setPlatformMetric] = useState('mentions');

  const addKeywordToTrend = useCallback((kw) => {
    const key = String(kw || '').trim();
    if (!key) return;
    setSelectedTrendKeywords((prev) => {
      const set = new Set(prev);
      if (set.has(key)) {
        message.info('关键词已在趋势选择中');
        return Array.from(set);
      }
      if (set.size >= 5) {
        message.warning('最多选择 5 个关键词');
        return Array.from(set);
      }
      set.add(key);
      message.success(`已添加关键词：${key}`);
      return Array.from(set);
    });
  }, []);

  const countKeywordOccurrences = useCallback((text, keywords, englishWordBoundary = true) => {
    const s = typeof text === 'string' ? text : String(text || '');
    const list = Array.isArray(keywords) ? keywords.filter(Boolean) : [];
    const escape = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return list
      .map((kw) => {
        const e = escape(String(kw));
        const useBoundary = englishWordBoundary && /^[A-Za-z]+$/.test(String(kw));
        const re = new RegExp(useBoundary ? `\\b${e}\\b` : e, 'gi');
        const c = [...s.matchAll(re)].length;
        return { keyword: String(kw), count: c };
      })
      .filter((item) => item.count > 0);
  }, []);

  const fetchPagedHistory = useCallback(async () => {
    setLoading(true);
    try {
      const LIMIT = 50;
      const MAX_PAGES = 5;
      const all = [];
      for (let page = 1; page <= MAX_PAGES; page += 1) {
        const res = await axios.get(`/api/detection/history/${userId}`, { params: { page, limit: LIMIT } });
        const data = res?.data?.data || {};
        const rows = Array.isArray(data.records) ? data.records : [];
        all.push(...rows);
        if (rows.length < LIMIT) break;
      }

      setRecords(
        all.map((r) => {
          const brandKeywords = typeof r.brand_keywords === 'string'
            ? r.brand_keywords.split(/[,，]/).map((s) => s.trim()).filter(Boolean)
            : Array.isArray(r.brand_keywords)
              ? r.brand_keywords
              : [];
          const originalText = r.resultDetail?.ai_response_original || '';
          const keywordStats = Array.isArray(r.result_summary?.keyword_counts) && r.result_summary.keyword_counts.length > 0
            ? r.result_summary.keyword_counts
            : countKeywordOccurrences(originalText, brandKeywords, true);
          const totalMention = (Array.isArray(keywordStats) ? keywordStats : []).reduce((acc, k) => acc + (k?.count || 0), 0);
          return {
            id: r.id,
            question: r.question,
            platform: r.platform,
            created_at: r.created_at,
            detection_time: r.detection_time,
            keywordStats,
            totalMention,
          };
        })
      );
      message.success('数据仪表已刷新');
    } catch {
      message.error('获取数据仪表失败');
    } finally {
      setLoading(false);
    }
  }, [userId, countKeywordOccurrences]);

  useEffect(() => { fetchPagedHistory(); }, [fetchPagedHistory]);

  // 过滤：平台、时间与关键词（原型）
  const toTime = useCallback((v) => {
    try {
      if (!v) return 0;
      if (typeof v === 'object' && typeof v.valueOf === 'function') return Number(v.valueOf());
      return new Date(v).getTime();
    } catch { return 0; }
  }, []);

  const filteredRecords = useMemo(() => {
    const hasPlatforms = Array.isArray(selectedPlatforms) && selectedPlatforms.length > 0;
    const hasDate = Array.isArray(dateRange) && dateRange.length === 2 && dateRange[0] && dateRange[1];
    const kw = String(keywordQuery || '').trim().toLowerCase();
    return records.filter((r) => {
      const okPlatform = hasPlatforms ? selectedPlatforms.includes(r.platform) : true;
      const t = new Date(r.created_at || 0).getTime();
      const okDate = hasDate ? (t >= toTime(dateRange[0]) && t <= toTime(dateRange[1])) : true;
      const okKw = kw ? (String(r.question || '').toLowerCase().includes(kw)) : true;
      return okPlatform && okDate && okKw;
    });
  }, [records, selectedPlatforms, dateRange, keywordQuery, toTime]);

  // 仅保留表格所需聚合
  const aggregated = useMemo(() => {
    const map = new Map();
    for (const r of filteredRecords) {
      const key = r.question || '';
      const recKwStats = Array.isArray(r.keywordStats) ? r.keywordStats : [];
      let entry = map.get(key);
      if (!entry) {
        entry = { question: key, totalMention: 0, recordCount: 0, lastTime: r.created_at, keywordCounts: new Map() };
        map.set(key, entry);
      }
      entry.totalMention += r.totalMention;
      entry.recordCount += 1;
      const tPrev = new Date(entry.lastTime || 0).getTime();
      const tCurr = new Date(r.created_at || 0).getTime();
      entry.lastTime = tCurr > tPrev ? r.created_at : entry.lastTime;
      for (const s of recKwStats) {
        const prevCount = entry.keywordCounts.get(s.keyword) || 0;
        entry.keywordCounts.set(s.keyword, prevCount + (s.count || 0));
      }
    }
    const list = Array.from(map.values()).map((e) => ({
      question: e.question,
      totalMention: e.totalMention,
      recordCount: e.recordCount,
      lastTime: e.lastTime,
      keywords: Array.from(e.keywordCounts.entries())
        .map(([keyword, count]) => ({ keyword, count }))
        .sort((a, b) => b.count - a.count),
    }));
    list.sort((a, b) => b.totalMention - a.totalMention || (new Date(b.lastTime).getTime() - new Date(a.lastTime).getTime()));
    return list.slice(0, 50);
  }, [filteredRecords]);

  const maxMention = useMemo(() => (aggregated.length ? Math.max(...aggregated.map((x) => x.totalMention)) : 0), [aggregated]);

  // 概览 KPI（原型占位的简易计算）
  const kpis = useMemo(() => {
    const questionsCovered = aggregated.length;
    const platforms = Array.from(new Set(filteredRecords.map(r => r.platform))).length;
    const citations = filteredRecords.reduce((acc, r) => acc + (r.totalMention || 0), 0);
    const coverageRate = filteredRecords.length ? Math.round((filteredRecords.filter(r => r.totalMention > 0).length / filteredRecords.length) * 100) : 0;
    return {
      coverageRate,
      citations,
      questionsCovered,
      platforms,
    };
  }, [filteredRecords, aggregated]);

  // 平台表现（原型占位）
  const platformSummary = useMemo(() => {
    const map = new Map();
    for (const r of filteredRecords) {
      const e = map.get(r.platform) || { platform: r.platform, records: 0, mentions: 0 };
      e.records += 1;
      e.mentions += r.totalMention || 0;
      map.set(r.platform, e);
    }
    return Array.from(map.values()).sort((a, b) => b.mentions - a.mentions);
  }, [filteredRecords]);

  // 趋势折线图：按日聚合记录与品牌提及
  const daySeries = useMemo(() => {
    const bucket = new Map();
    const fmtKey = (dateObj) => {
      if (!(dateObj instanceof Date)) return '未知';
      const y = dateObj.getFullYear();
      const m = dateObj.getMonth();
      const d = dateObj.getDate();
      if (trendGroup === 'day') {
        return `${y}/${String(m + 1).padStart(2, '0')}/${String(d).padStart(2, '0')}`;
      }
      if (trendGroup === 'month') {
        return `${y}/${String(m + 1).padStart(2, '0')}`;
      }
      // week: 以周一为一周起始，计算该周的编号（年内周序）
      const tmp = new Date(y, m, d);
      const dayOfWeek = tmp.getDay(); // 0-6, 周日=0
      const deltaToMonday = (dayOfWeek + 6) % 7; // 距离周一的天数
      const monday = new Date(tmp);
      monday.setDate(tmp.getDate() - deltaToMonday);
      const startOfYear = new Date(y, 0, 1);
      const weekIndex = Math.floor((monday - startOfYear) / (7 * 24 * 60 * 60 * 1000)) + 1;
      return `${y}/W${String(weekIndex).padStart(2, '0')}`;
    };
    const parseKey = (s) => {
      // 用于排序，不同聚合返回不同排序键
      if (trendGroup === 'day') {
        const m = /^([0-9]{4})\/([0-9]{2})\/([0-9]{2})$/.exec(String(s));
        if (!m) return NaN;
        return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
      }
      if (trendGroup === 'month') {
        const m = /^([0-9]{4})\/([0-9]{2})$/.exec(String(s));
        if (!m) return NaN;
        return new Date(Number(m[1]), Number(m[2]) - 1, 1).getTime();
      }
      const m = /^([0-9]{4})\/W([0-9]{2})$/.exec(String(s));
      if (!m) return NaN;
      const y = Number(m[1]);
      const w = Number(m[2]);
      // 以年初第一周为起始，近似排序
      return new Date(y, 0, 1 + (w - 1) * 7).getTime();
    };
    for (const r of filteredRecords) {
      const baseTime = r.created_at || r.detection_time || (r.resultDetail && r.resultDetail.created_at) || null;
      const baseDate = new Date(baseTime);
      const day = fmtKey(baseDate);
      const prev = bucket.get(day) || { records: 0, mentions: 0 };
      prev.records += 1;
      prev.mentions += r.totalMention || 0;
      bucket.set(day, prev);
    }
    const rows = Array.from(bucket.entries()).map(([day, v]) => ({ day, ...v }));
    rows.sort((a, b) => parseKey(a.day) - parseKey(b.day));
    const series = [];
    for (const r of rows) {
      if (trendMetric === 'records' || trendMetric === 'both') {
        series.push({ day: r.day, type: '记录数', value: r.records });
      }
      if (trendMetric === 'mentions' || trendMetric === 'both') {
        series.push({ day: r.day, type: '品牌提及', value: r.mentions });
      }
    }
    return series;
  }, [filteredRecords, trendMetric, trendGroup]);

  // 平台占比（记录数）
  const platformShare = useMemo(() => {
    const map = new Map();
    for (const r of filteredRecords) {
      const c = map.get(r.platform) || 0;
      map.set(r.platform, c + 1);
    }
    return Array.from(map.entries()).map(([type, value]) => ({ type, value })).sort((a, b) => b.value - a.value);
  }, [filteredRecords]);

  const platformShareTotal = useMemo(() => (Array.isArray(platformShare) ? platformShare.reduce((acc, x) => acc + (Number(x.value) || 0), 0) : 0), [platformShare]);

  // 平台明细数据（用于表格与导出）
  const platformDetails = useMemo(() => {
    const map = new Map();
    for (const r of filteredRecords) {
      const entry = map.get(r.platform) || { platform: r.platform, records: 0, mentions: 0, lastTime: null };
      entry.records += 1;
      entry.mentions += r.totalMention || 0;
      const tPrev = new Date(entry.lastTime || 0).getTime();
      const baseTime = r.created_at || r.detection_time || (r.resultDetail && r.resultDetail.created_at) || null;
      const tCurr = new Date(baseTime || 0).getTime();
      entry.lastTime = tCurr > tPrev ? baseTime : entry.lastTime;
      map.set(r.platform, entry);
    }
    return Array.from(map.values()).sort((a, b) => b.mentions - a.mentions);
  }, [filteredRecords]);



  // 关键词榜单（整体聚合 Top N）
  const keywordLeaderboard = useMemo(() => {
    const map = new Map();
    for (const r of filteredRecords) {
      const list = Array.isArray(r.keywordStats) ? r.keywordStats : [];
      for (const s of list) {
        const prev = map.get(s.keyword) || 0;
        map.set(s.keyword, prev + (s.count || 0));
      }
    }
    const arr = Array.from(map.entries()).map(([keyword, count]) => ({ keyword, count }));
    arr.sort((a, b) => b.count - a.count);
    return arr.slice(0, 30);
  }, [filteredRecords]);

  // 默认选中 Top3 关键词用于趋势联动
  useEffect(() => {
    if (!selectedTrendKeywords.length && keywordLeaderboard.length) {
      setSelectedTrendKeywords(keywordLeaderboard.slice(0, 3).map(k => k.keyword));
    }
  }, [keywordLeaderboard, selectedTrendKeywords.length]);

  // 关键词趋势（按选中关键词分组）
  const keywordTrendSeries = useMemo(() => {
    if (!selectedTrendKeywords || selectedTrendKeywords.length === 0) return [];
    const bucket = new Map(); // key: timeKey, value: Map<keyword,count>
    const fmtKey = (dateObj) => {
      if (!(dateObj instanceof Date)) return '未知';
      const y = dateObj.getFullYear();
      const m = dateObj.getMonth();
      const d = dateObj.getDate();
      if (trendGroup === 'day') return `${y}/${String(m + 1).padStart(2, '0')}/${String(d).padStart(2, '0')}`;
      if (trendGroup === 'month') return `${y}/${String(m + 1).padStart(2, '0')}`;
      const tmp = new Date(y, m, d);
      const dayOfWeek = tmp.getDay();
      const deltaToMonday = (dayOfWeek + 6) % 7;
      const monday = new Date(tmp);
      monday.setDate(tmp.getDate() - deltaToMonday);
      const startOfYear = new Date(y, 0, 1);
      const weekIndex = Math.floor((monday - startOfYear) / (7 * 24 * 60 * 60 * 1000)) + 1;
      return `${y}/W${String(weekIndex).padStart(2, '0')}`;
    };
    const parseKey = (s) => {
      if (trendGroup === 'day') {
        const m = /^([0-9]{4})\/([0-9]{2})\/([0-9]{2})$/.exec(String(s));
        if (!m) return NaN;
        return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
      }
      if (trendGroup === 'month') {
        const m = /^([0-9]{4})\/([0-9]{2})$/.exec(String(s));
        if (!m) return NaN;
        return new Date(Number(m[1]), Number(m[2]) - 1, 1).getTime();
      }
      const m = /^([0-9]{4})\/W([0-9]{2})$/.exec(String(s));
      if (!m) return NaN;
      const y = Number(m[1]);
      const w = Number(m[2]);
      return new Date(y, 0, 1 + (w - 1) * 7).getTime();
    };
    for (const r of filteredRecords) {
      const baseTime = r.created_at || r.detection_time || (r.resultDetail && r.resultDetail.created_at) || null;
      const baseDate = new Date(baseTime);
      const key = fmtKey(baseDate);
      const stats = Array.isArray(r.keywordStats) ? r.keywordStats : [];
      const m = bucket.get(key) || new Map();
      for (const kw of selectedTrendKeywords) {
        const hit = stats.find(s => s.keyword === kw);
        const prev = m.get(kw) || 0;
        m.set(kw, prev + (hit?.count || 0));
      }
      bucket.set(key, m);
    }
    const rows = Array.from(bucket.entries()).map(([day, m]) => {
      const obj = { day };
      for (const kw of selectedTrendKeywords) obj[kw] = m.get(kw) || 0;
      return obj;
    });
    rows.sort((a, b) => parseKey(a.day) - parseKey(b.day));
    const series = [];
    for (const r of rows) {
      for (const kw of selectedTrendKeywords) {
        series.push({ day: r.day, keyword: kw, value: r[kw] || 0 });
      }
    }
    return series;
  }, [filteredRecords, selectedTrendKeywords, trendGroup]);


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

  const formatDateShort = (v) => {
    try {
      const d = new Date(v);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${dd}`;
    } catch {
      return '-';
    }
  };

  const columns = [
    { title: '排名', dataIndex: 'rank', width: 80, render: (_, __, idx) => <Tag color="blue">{idx + 1}</Tag> },
    { title: '问题', dataIndex: 'question', ellipsis: true },
    {
      title: '总提及次数',
      dataIndex: 'totalMention',
      width: 220,
      render: (v) => (
        <Space size="small" style={{ width: '100%' }}>
          <span style={{ minWidth: 36 }}>{v}</span>
          <Progress percent={maxMention > 0 ? Math.round((v / maxMention) * 100) : 0} size="small" status="active" />
        </Space>
      ),
    },
    {
      title: '关键词统计',
      dataIndex: 'keywords',
      width: 280,
      render: (_, record) => {
        const list = Array.isArray(record.keywords) ? record.keywords : [];
        if (!list.length) return <span>-</span>;
        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxWidth: '100%' }}>
            {list.map((k, idx) => (
              <Tag
                key={`${k.keyword}-${idx}`}
                color="gold"
                style={{ cursor: 'pointer' }}
                onClick={() => addKeywordToTrend(k.keyword)}
              >{`${k.keyword} × ${k.count}`}</Tag>
            ))}
          </div>
        );
      },
    },
    { title: '记录数', dataIndex: 'recordCount', width: 100 },
    { title: '最近检测时间', dataIndex: 'lastTime', width: 180, render: (v) => formatDateTimeShort(v) },
  ];

  // 顶部筛选与操作区（原型）
  const platformOptions = useMemo(() => {
    const set = new Set(records.map(r => r.platform).filter(Boolean));
    return Array.from(set).map(p => ({ label: p, value: p }));
  }, [records]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card title="筛选与总览" extra={<Space>
        <Button onClick={fetchPagedHistory} loading={loading}>刷新</Button>
      </Space>}>
        {isDemoUser && (
          <Alert style={{ marginBottom: 12 }} type="info" showIcon message="当前为演示视图：未登录或无用户ID，展示用户 1 的历史数据。" />
        )}
        <Row gutter={[16, 16]}>
          <Col xs={24} md={10} lg={8}>
            <Space orientation="vertical" style={{ width: '100%' }}>
              <div style={{ fontWeight: 500 }}>平台筛选</div>
              <Select
                mode="multiple"
                allowClear
                placeholder="选择平台（留空为全部）"
                style={{ width: '100%' }}
                options={platformOptions}
                value={selectedPlatforms}
                onChange={setSelectedPlatforms}
              />
            </Space>
          </Col>
          <Col xs={24} md={8} lg={8}>
            <Space orientation="vertical" style={{ width: '100%' }}>
              <div style={{ fontWeight: 500 }}>时间范围</div>
              <DatePicker.RangePicker style={{ width: '100%' }} value={dateRange} onChange={setDateRange} allowClear />
            </Space>
          </Col>
          <Col xs={24} md={6} lg={8}>
            <Space orientation="vertical" style={{ width: '100%' }}>
              <div style={{ fontWeight: 500 }}>关键词搜索</div>
              <Input.Search placeholder="按问题关键词过滤" value={keywordQuery} onChange={(e) => setKeywordQuery(e.target.value)} allowClear />
            </Space>
          </Col>
        </Row>
        <Row gutter={[16, 16]} style={{ marginTop: 8 }}>
          <Col xs={24} md={10} lg={8}>
            <Space orientation="vertical" style={{ width: '100%' }}>
              <div style={{ fontWeight: 500 }}>趋势指标</div>
              <Select
                style={{ width: '100%' }}
                value={trendMetric}
                onChange={setTrendMetric}
                options={[
                  { label: '同时显示：记录数 + 品牌提及', value: 'both' },
                  { label: '仅显示记录数', value: 'records' },
                  { label: '仅显示品牌提及', value: 'mentions' }
                ]}
              />
            </Space>
          </Col>
          <Col xs={24} md={8} lg={8}>
            <Space orientation="vertical" style={{ width: '100%' }}>
              <div style={{ fontWeight: 500 }}>时间聚合</div>
              <Select
                style={{ width: '100%' }}
                value={trendGroup}
                onChange={setTrendGroup}
                options={[
                  { label: '按日', value: 'day' },
                  { label: '按周', value: 'week' },
                  { label: '按月', value: 'month' }
                ]}
              />
            </Space>
          </Col>
        </Row>
        <Divider style={{ margin: '12px 0' }} />
        <Space size="small" wrap>
          <Tag color="blue">平台：{selectedPlatforms.length ? `${selectedPlatforms.length} 个` : '全部'}</Tag>
          <Tag color="blue">时间：{(Array.isArray(dateRange) && dateRange[0] && dateRange[1]) ? `${formatDateShort(toTime(dateRange[0]))} ~ ${formatDateShort(toTime(dateRange[1]))}` : '全部'}</Tag>
          <Tag color="blue">关键词：{String(keywordQuery || '').trim() || '未设置'}</Tag>
        </Space>
        <Divider style={{ margin: '16px 0' }} />
        <Row gutter={[16, 16]}>
          <Col xs={12} md={6}>
            <Card size="small">
              <Statistic title="覆盖率" value={kpis.coverageRate} suffix="%" />
            </Card>
          </Col>
          <Col xs={12} md={6}>
            <Card size="small">
              <Statistic title="被引用次数" value={kpis.citations} />
            </Card>
          </Col>
          <Col xs={12} md={6}>
            <Card size="small">
              <Statistic title="问题覆盖数" value={kpis.questionsCovered} />
            </Card>
          </Col>
          <Col xs={12} md={6}>
            <Card size="small">
              <Statistic title="平台覆盖数" value={kpis.platforms} />
            </Card>
          </Col>
        </Row>
        <Alert style={{ marginTop: 12 }} type="info" showIcon message="以上为原型占位数值，实际公式与数据源可进一步完善。" />
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card
            title={`趋势（按${trendGroup === 'day' ? '日' : trendGroup === 'week' ? '周' : '月'}）`}
            extra={
              <Button onClick={() => {
                try {
                  const rows = Array.isArray(daySeries) ? daySeries : [];
                  const header = ['日期', '类型', '数值'];
                  const lines = [header.join(',')];
                  for (const r of rows) {
                    const line = [
                      '"' + String(r.day).replace(/"/g, '""') + '"',
                      '"' + String(r.type).replace(/"/g, '""') + '"',
                      String(r.value)
                    ].join(',');
                    lines.push(line);
                  }
                  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `geo_trend_${trendGroup}_${Date.now()}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                } catch {
                  message.error('导出失败');
                }
              }}>导出 CSV</Button>
            }
          >
            {daySeries.length ? (
              <Line
                data={daySeries}
                xField="day"
                yField="value"
                seriesField="type"
                smooth
                point={{ size: 4, shape: 'circle' }}
                tooltip={{ showMarkers: true, shared: true, enterable: true, formatter: (datum) => ({ name: datum.type, value: Number(datum.value) }) }}
                interactions={[{ type: 'tooltip', enable: true }]}
                legend={{ position: 'top' }}
                height={280}
                meta={{ value: { alias: '数值' } }}
                yAxis={{ label: { formatter: (v) => String(Math.round(Number(v))) } }}
                color={({ type }) => (type === '记录数' ? '#1677ff' : '#52c41a')}
                slider={{ start: 0.6, end: 1 }}
              />
            ) : (
              <Alert type="info" message="暂无数据用于绘制趋势图" showIcon />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="平台表现" extra={<Select size="small" value={platformMetric} onChange={setPlatformMetric} options={[{ label: '提及次数', value: 'mentions' }, { label: '记录数', value: 'records' }]} />}>
            {platformSummary.length ? (
              <Column
                data={platformSummary}
                xField="platform"
                yField={platformMetric}
                label={{
                  position: 'top',
                  style: { fill: '#000', opacity: 0.6 },
                }}
                height={280}
                yAxis={{ label: { formatter: (v) => String(Math.round(Number(v))) } }}
              />
            ) : (
              <Alert type="info" message="暂无数据用于绘制平台表现" showIcon />
            )}
          </Card>
        </Col>
      </Row>

      <Card title="关键词趋势">
        <Row gutter={[16, 16]}>
          <Col xs={24} md={8} lg={6}>
            <Space orientation="vertical" style={{ width: '100%' }}>
              <div style={{ fontWeight: 500 }}>选择关键词（最多选 5 个）</div>
              <Select
                mode="multiple"
                allowClear
                placeholder="请选择关键词"
                style={{ width: '100%' }}
                maxTagCount={5}
                value={selectedTrendKeywords}
                onChange={(vals) => setSelectedTrendKeywords(Array.isArray(vals) ? vals.slice(0, 5) : [])}
                options={keywordLeaderboard.map(k => ({ label: k.keyword, value: k.keyword }))}
              />
            </Space>
          </Col>
          <Col xs={24} md={16} lg={18}>
            {keywordTrendSeries.length ? (
              <Line
                data={keywordTrendSeries}
                xField="day"
                yField="value"
                seriesField="keyword"
                smooth
                point={{ size: 4, shape: 'circle' }}
                tooltip={{ showMarkers: true, shared: true, enterable: true, formatter: (datum) => ({ name: datum.keyword, value: Number(datum.value) }) }}
                interactions={[{ type: 'tooltip', enable: true }]}
                legend={{ position: 'top' }}
                height={280}
                meta={{ value: { alias: '提及次数' } }}
                yAxis={{ label: { formatter: (v) => String(Math.round(Number(v))) } }}
                color={({ keyword }) => {
                  const idx = (String(keyword).charCodeAt(0) + String(keyword).length) % 6;
                  const palette = ['#1677ff', '#52c41a', '#fa8c16', '#eb2f96', '#13c2c2', '#722ed1'];
                  return palette[idx];
                }}
                slider={{ start: 0.6, end: 1 }}
              />
            ) : (
              <Alert type="info" message="请选择关键词以查看趋势" showIcon />
            )}
          </Col>
        </Row>
      </Card>

      <Card title="平台表现明细" extra={<Button onClick={() => {
        try {
          const rows = (Array.isArray(platformDetails) ? platformDetails : []);
          const header = ['平台', '记录数', '品牌提及', '最近时间'];
          const lines = [header.join(',')];
          for (const r of rows) {
            const line = [
              '"' + String(r.platform).replace(/"/g, '""') + '"',
              String(r.records),
              String(r.mentions),
              '"' + String(formatDateTimeShort(r.lastTime)) + '"'
            ].join(',');
            lines.push(line);
          }
          const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `geo_platform_details_${Date.now()}.csv`;
          a.click();
          URL.revokeObjectURL(url);
        } catch {
          message.error('导出失败');
        }
      }}>导出 CSV</Button>}>
        <Table
          rowKey={(r) => r.platform}
          dataSource={platformDetails}
          columns={[
            { title: '平台', dataIndex: 'platform', key: 'platform' },
            { title: '记录数', dataIndex: 'records', key: 'records', width: 100 },
            { title: '品牌提及', dataIndex: 'mentions', key: 'mentions', width: 120 },
            { title: '最近时间', dataIndex: 'lastTime', key: 'lastTime', width: 180, render: (v) => formatDateTimeShort(v) },
          ]}
          size="small"
          pagination={{ pageSize: 10 }}
        />
      </Card>


      <Row gutter={[16, 16]}>
        <Col xs={24}>
          <Card title="平台占比（记录数）">
            {platformShare.length ? (
              <Pie
                data={platformShare}
                angleField="value"
                colorField="type"
                radius={0.9}
                label={{
                  formatter: (datum) => {
                    const val = Number(datum?.value) || 0;
                    const total = platformShareTotal || 0;
                    const pct = total > 0 ? (val / total) * 100 : 0;
                    return `${datum?.type ?? ''} ${pct.toFixed(1)}%`;
                  }
                }}
                interactions={[{ type: 'element-active' }]}
                height={280}
                legend={{ position: 'right' }}
              />
            ) : (
              <Alert type="info" message="暂无数据用于绘制平台占比" showIcon />
            )}
          </Card>
        </Col>
      </Row>

      <Card title="问题热榜与关键词提及" extra={<Button onClick={() => {
        try {
          const rows = aggregated || [];
          const header = ['问题', '总提及次数', '记录数', '最近检测时间', '关键词统计'];
          const lines = [header.join(',')];
          for (const r of rows) {
            const kwStr = (Array.isArray(r.keywords) ? r.keywords : []).map(k => `${k.keyword}:${k.count}`).join(';');
            const line = [
              '"' + String(r.question).replace(/"/g, '""') + '"',
              String(r.totalMention),
              String(r.recordCount),
              '"' + String(formatDateTimeShort(r.lastTime)) + '"',
              '"' + kwStr.replace(/"/g, '""') + '"'
            ].join(',');
            lines.push(line);
          }
          const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `geo_hot_questions_${Date.now()}.csv`;
          a.click();
          URL.revokeObjectURL(url);
        } catch {
          message.error('导出失败');
        }
      }}>导出 CSV</Button>}>
        <Table
          rowKey={(r) => r.question}
          loading={loading}
          dataSource={aggregated}
          columns={columns}
          size="small"
          tableLayout="fixed"
          scroll={{ x: 'max-content', y: 540 }}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      <Card title="关键词榜单（Top 30）">
        {keywordLeaderboard.length ? (
          <Table
            rowKey={(r) => r.keyword}
            dataSource={keywordLeaderboard}
            columns={[
              { title: '关键词', dataIndex: 'keyword', key: 'keyword' },
              { title: '总提及次数', dataIndex: 'count', key: 'count', width: 160 }
            ]}
            size="small"
            onRow={(record) => ({ onClick: () => addKeywordToTrend(record.keyword), style: { cursor: 'pointer' } })}
            pagination={{ pageSize: 10 }}
          />
        ) : (
          <Alert type="info" message="暂无关键词统计数据" showIcon />
        )}
      </Card>


    </div>
  );
}

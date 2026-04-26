// @ts-nocheck
'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Card, Table, Tag, Space, Button, Popconfirm, Modal, Form, Input, Select, message, TimePicker, Switch, DatePicker } from 'antd';
import axios from 'axios';
import dayjs from 'dayjs';
import { sequentialWithDelay } from '@/utils/concurrentLimit';

const { RangePicker } = DatePicker;

interface ScheduleItem {
  id: number;
  question: string;
  brand?: string;
  platforms: string[];
  highlight_keywords: string[];
  daily_time: string;
  timezone?: string;
  enabled: boolean;
  next_run_at?: string;
  last_run_at?: string;
  created_at: string;
  updated_at: string;
}

export default function GeoTasksPage() {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<ScheduleItem[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<ScheduleItem | null>(null);
  const [form] = Form.useForm();
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm] = Form.useForm();
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [filterForm] = Form.useForm();

  const API_BASE = (
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:3000'
  ).replace(/\/$/, '');

  const fetchSchedules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/schedules`);
      const list = res?.data?.data || [];
      const arr = Array.isArray(list) ? list : [];
      setItems(arr);
      applyFilters(arr);
    } catch {
      message.error('获取任务列表失败');
    } finally { setLoading(false); }
  }, [API_BASE]);

  useEffect(() => { fetchSchedules(); }, [fetchSchedules]);

  const applyFilters = useCallback((sourceItems = items) => {
    const { q, platforms, enabled, dateRange } = filterForm.getFieldsValue();
    let data = Array.isArray(sourceItems) ? [...sourceItems] : [];
    if (q && String(q).trim()) {
      const kw = String(q).trim().toLowerCase();
      data = data.filter(r => String(r.question || '').toLowerCase().includes(kw));
    }
    const brandFilter = filterForm.getFieldValue('brand');
    if (brandFilter && String(brandFilter).trim()) {
      const bk = String(brandFilter).trim().toLowerCase();
      data = data.filter(r => String(r.brand || '').toLowerCase().includes(bk));
    }
    if (Array.isArray(platforms) && platforms.length > 0) {
      data = data.filter(r => Array.isArray(r.platforms) && platforms.every(p => r.platforms.includes(p)));
    }
    if (typeof enabled === 'boolean') {
      data = data.filter(r => !!r.enabled === enabled);
    }
    if (Array.isArray(dateRange) && dateRange.length === 2 && dateRange[0] && dateRange[1]) {
      const [start, end] = dateRange;
      const s = start.startOf('day').toDate().getTime();
      const e = end.endOf('day').toDate().getTime();
      data = data.filter(r => {
        const t = r.last_run_at ? new Date(r.last_run_at).getTime() : 0;
        return t >= s && t <= e;
      });
    }
    setFilteredItems(data);
  }, [items, filterForm]);

  useEffect(() => {
    const unsub = filterForm.subscribe?.(() => applyFilters());
    return () => { if (typeof unsub === 'function') unsub(); };
  }, [applyFilters, filterForm]);

  const onFilterSubmit = () => applyFilters();
  const onFilterReset = () => { filterForm.resetFields(); applyFilters(items); };

  const toggleEnabled = async (row: ScheduleItem) => {
    try {
      await axios.put(`${API_BASE}/api/schedules/${row.id}`, { enabled: !row.enabled });
      message.success(row.enabled ? '已停用任务' : '已启用任务');
      fetchSchedules();
    } catch {
      message.error('操作失败');
    }
  };

  const runNow = async (row: ScheduleItem) => {
    try {
      await axios.post(`${API_BASE}/api/schedules/${row.id}/run`);
      message.success('已触发执行');
      fetchSchedules();
    } catch {
      message.error('触发失败');
    }
  };

  const deleteItem = async (row: ScheduleItem) => {
    try {
      await axios.delete(`${API_BASE}/api/schedules/${row.id}`);
      message.success('已删除任务');
      fetchSchedules();
    } catch {
      message.error('删除失败');
    }
  };

  // 批量操作
  const batchEnable = async () => {
    if (selectedRowKeys.length === 0) return;
    try {
      await sequentialWithDelay(selectedRowKeys, async (id) => {
        await axios.put(`${API_BASE}/api/schedules/${id}`, { enabled: true });
      }, 100);
      message.success('批量启用完成');
      setSelectedRowKeys([]);
      fetchSchedules();
    } catch {
      message.error('批量启用失败');
    }
  };

  const batchDisable = async () => {
    if (selectedRowKeys.length === 0) return;
    try {
      await sequentialWithDelay(selectedRowKeys, async (id) => {
        await axios.put(`${API_BASE}/api/schedules/${id}`, { enabled: false });
      }, 100);
      message.success('批量停用完成');
      setSelectedRowKeys([]);
      fetchSchedules();
    } catch {
      message.error('批量停用失败');
    }
  };

  const batchRun = async () => {
    if (selectedRowKeys.length === 0) return;
    try {
      await sequentialWithDelay(selectedRowKeys, async (id) => {
        await axios.post(`${API_BASE}/api/schedules/${id}/run`);
      }, 100);
      message.success('批量触发执行完成');
      setSelectedRowKeys([]);
      fetchSchedules();
    } catch {
      message.error('批量触发执行失败');
    }
  };

  const batchDelete = async () => {
    if (selectedRowKeys.length === 0) return;
    try {
      await sequentialWithDelay(selectedRowKeys, async (id) => {
        await axios.delete(`${API_BASE}/api/schedules/${id}`);
      }, 100);
      message.success('批量删除完成');
      setSelectedRowKeys([]);
      fetchSchedules();
    } catch {
      message.error('批量删除失败');
    }
  };

  const openEdit = (row: ScheduleItem) => {
    setEditRecord(row);
    setEditOpen(true);
    form.setFieldsValue({
      question: row.question || '',
      brand: row.brand || '',
      platforms: Array.isArray(row.platforms) ? row.platforms : [],
      daily_time: row.daily_time ? dayjs(row.daily_time, 'HH:mm') : null,
      highlight_keywords: Array.isArray(row.highlight_keywords) ? row.highlight_keywords : []
    });
  };

  const saveEdit = async () => {
    try {
      const values = await form.validateFields();
      const dailyTimeStr = values.daily_time?.format ? values.daily_time.format('HH:mm') : String(values.daily_time || '').trim();
      const payload = {
        question: String(values.question || '').trim(),
        brand: String(values.brand || '').trim(),
        platforms: Array.isArray(values.platforms) ? values.platforms : [],
        daily_time: dailyTimeStr,
        timezone: String(editRecord?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'),
        highlight_keywords: Array.isArray(values.highlight_keywords) ? values.highlight_keywords : []
      };
      await axios.put(`${API_BASE}/api/schedules/${editRecord!.id}`, payload);
      message.success('任务已更新');
      setEditOpen(false);
      setEditRecord(null);
      fetchSchedules();
    } catch (e: any) {
      if (e?.errorFields) return; // 表单校验错误
      message.error('更新失败');
    }
  };

  const openCreate = () => {
    setCreateOpen(true);
    createForm.setFieldsValue({
      question: '',
      brand: '',
      platforms: [],
      highlight_keywords: [],
      daily_time: dayjs('09:00', 'HH:mm'),
      enabled: true,
    });
  };

  const saveCreate = async () => {
    try {
      const values = await createForm.validateFields();
      const rawQuestion = String(values.question || '').trim();
      if (!rawQuestion) return;

      // 按换行符分割支持批量创建
      const questions = rawQuestion.split('\n').map(s => s.trim()).filter(Boolean);
      if (questions.length === 0) return;

      const basePayload = {
        platforms: Array.isArray(values.platforms) ? values.platforms : [],
        highlight_keywords: Array.isArray(values.highlight_keywords) ? values.highlight_keywords : [],
        daily_time: values.daily_time?.format ? values.daily_time.format('HH:mm') : String(values.daily_time || '').trim(),
        timeZone: String(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'),
        enabled: !!values.enabled,
        brand: String(values.brand || '').trim(),
      };

      setLoading(true);
      let successCount = 0;
      await sequentialWithDelay(questions, async (q) => {
        try {
          await axios.post(`${API_BASE}/api/schedules`, { ...basePayload, question: q });
          successCount++;
        } catch (e) {
          console.error(`创建任务失败 [${q}]:`, e);
        }
      }, 100);

      if (successCount > 0) {
        message.success(`成功创建 ${successCount} 个定时任务`);
      } else {
        message.warning('任务创建失败');
      }

      setCreateOpen(false);
      createForm.resetFields();
      fetchSchedules();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error('创建失败: ' + (e.message || '未知错误'));
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    { title: '问题', dataIndex: 'question', key: 'question', ellipsis: true },
    { title: '品牌', dataIndex: 'brand', key: 'brand', width: 120, ellipsis: true, render: (t: string) => t || '-' },
    {
      title: '平台', dataIndex: 'platforms', key: 'platforms', render: (vals: string[]) => (
        <Space wrap>
          {(Array.isArray(vals) ? vals : []).map(p => <Tag color="processing" key={p}>{p}</Tag>)}
        </Space>
      )
    },
    {
      title: '关键词', dataIndex: 'highlight_keywords', key: 'highlight_keywords', render: (vals: string[]) => (
        <Space wrap>
          {(Array.isArray(vals) ? vals : []).map(k => <Tag color="warning" key={k}>{k}</Tag>)}
        </Space>
      )
    },
    { title: '每天时间', dataIndex: 'daily_time', key: 'daily_time' },
    { title: '启用', dataIndex: 'enabled', key: 'enabled', render: (v: boolean) => v ? <Tag color="success">已启用</Tag> : <Tag>未启用</Tag> },
    { title: '下次运行', dataIndex: 'next_run_at', key: 'next_run_at', render: (v: string) => v ? new Date(v).toLocaleString() : '-' },
    { title: '上次运行', dataIndex: 'last_run_at', key: 'last_run_at', render: (v: string) => v ? new Date(v).toLocaleString() : '-' },
    { title: '创建时间', dataIndex: 'created_at', key: 'created_at', render: (v: string) => v ? new Date(v).toLocaleString() : '-' },
    {
      title: '操作', key: 'actions', render: (_: any, row: ScheduleItem) => (
        <Space>
          <Button size="small" onClick={() => toggleEnabled(row)}>{row.enabled ? '停用' : '启用'}</Button>
          <Button size="small" onClick={() => runNow(row)}>立即执行</Button>
          <Popconfirm title="确认删除该任务？" onConfirm={() => deleteItem(row)}>
            <Button size="small" danger>删除</Button>
          </Popconfirm>
          <Button size="small" type="primary" onClick={() => openEdit(row)}>编辑</Button>
        </Space>
      )
    },
  ];

  const platformOptions = [
    { label: '豆包', value: 'doubao' },
    { label: 'DeepSeek', value: 'deepseek' },
    { label: 'Kimi', value: 'kimi' },
    { label: '千问', value: 'qianwen' }
  ];

  const brandOptions = useMemo(() => {
    const brands = new Set<string>();
    (items || []).forEach(item => {
      if (item.brand && String(item.brand).trim()) {
        brands.add(String(item.brand).trim());
      }
    });
    return Array.from(brands).sort().map(b => ({ label: b, value: b }));
  }, [items]);

  return (
    <Card
      title="定时查询"
      extra={<Space><Button size="small" onClick={fetchSchedules}>刷新</Button><Button size="small" type="primary" onClick={openCreate}>新建任务</Button></Space>}
      styles={{ header: { alignItems: 'flex-start' } }}
    >
      <Form form={filterForm} layout="inline" onFinish={onFilterSubmit} style={{ marginBottom: 12 }}>
        <Form.Item name="q" label="搜索">
          <Input size="small" placeholder="按问题关键词搜索" allowClear style={{ width: 260 }} />
        </Form.Item>
        <Form.Item name="brand" label="品牌">
          <Select size="small" placeholder="选择品牌" allowClear showSearch options={brandOptions} style={{ width: 160 }} />
        </Form.Item>
        <Form.Item name="platforms" label="平台">
          <Select size="small" mode="multiple" options={platformOptions} placeholder="筛选平台" style={{ minWidth: 220 }} />
        </Form.Item>
        <Form.Item name="enabled" label="启用">
          <Select size="small" allowClear style={{ width: 120 }} placeholder="全部" options={[{ label: '已启用', value: true }, { label: '未启用', value: false }]} />
        </Form.Item>
        <Form.Item name="dateRange" label="上次运行时间">
          <RangePicker size="small" />
        </Form.Item>
        <Form.Item>
          <Space>
            <Button size="small" type="primary" htmlType="submit">应用筛选</Button>
            <Button size="small" onClick={onFilterReset}>重置</Button>
          </Space>
        </Form.Item>
      </Form>

      {selectedRowKeys.length > 0 && (
        <Space style={{ marginBottom: 12 }}>
          <Button onClick={batchEnable}>批量启用</Button>
          <Button onClick={batchDisable}>批量停用</Button>
          <Button onClick={batchRun}>批量执行</Button>
          <Popconfirm title="确认批量删除所选任务？" onConfirm={batchDelete}>
            <Button danger>批量删除</Button>
          </Popconfirm>
        </Space>
      )}

      <Table
        rowKey={(r) => r.id}
        dataSource={filteredItems}
        columns={columns}
        loading={loading}
        size="small"
        pagination={{ pageSize: 10 }}
        rowSelection={{ selectedRowKeys, onChange: (keys) => setSelectedRowKeys(keys) }}
        tableLayout="fixed"
        scroll={{ x: 'max-content' }}
      />

      <Modal
        title="编辑任务"
        open={editOpen}
        onOk={saveEdit}
        onCancel={() => { setEditOpen(false); setEditRecord(null); }}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="question" label="问题" rules={[{ required: true, message: '请输入问题' }]}>
            <Input.TextArea rows={3} placeholder="请输入每日检测的问题" />
          </Form.Item>
          <Form.Item name="brand" label="品牌">
            <Input placeholder="请输入监测品牌（可选）" />
          </Form.Item>
          <Form.Item name="platforms" label="平台" rules={[{ required: true, message: '请选择平台' }]}>
            <Select mode="multiple" options={platformOptions} placeholder="请选择一个或多个平台" />
          </Form.Item>
          <Form.Item name="highlight_keywords" label="监测关键词">
            <Select mode="tags" placeholder="输入关键词并回车添加" />
          </Form.Item>
          <Form.Item name="daily_time" label="每日时间" rules={[{ required: true, message: '请选择时间' }]}>
            <TimePicker format="HH:mm" minuteStep={1} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="新建任务"
        open={createOpen}
        onOk={saveCreate}
        onCancel={() => { setCreateOpen(false); createForm.resetFields(); }}
        okText="创建"
        cancelText="取消"
      >
        <Form form={createForm} layout="vertical">
          <Form.Item name="question" label="问题" rules={[{ required: true, message: '请输入问题' }]}>
            <Input.TextArea rows={3} placeholder="请输入每日检测的问题" />
          </Form.Item>
          <Form.Item name="brand" label="品牌">
            <Input placeholder="请输入监测品牌（可选）" />
          </Form.Item>
          <Form.Item name="platforms" label="平台" rules={[{ required: true, message: '请选择平台' }]}>
            <Select mode="multiple" options={platformOptions} placeholder="请选择一个或多个平台" />
          </Form.Item>
          <Form.Item name="highlight_keywords" label="监测关键词">
            <Select mode="tags" placeholder="输入关键词并回车添加" />
          </Form.Item>
          <Form.Item name="daily_time" label="每日时间" rules={[{ required: true, message: '请选择时间' }]}>
            <TimePicker format="HH:mm" minuteStep={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="enabled" label="是否启用" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}

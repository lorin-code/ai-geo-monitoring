// @ts-nocheck
'use client';

import React, { useEffect, useState } from 'react';
import { Card, Table, Space, Button, Tag, Input, Select, Modal, Form, Popconfirm, message } from 'antd';
import axios from 'axios';

const statusColors = { active: 'green', disabled: 'red' };

export default function AdminUsersPage() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('agd_token') || '' : '';

  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [q, setQ] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [lowThreshold, setLowThreshold] = useState(0.2);

  const [form] = Form.useForm();
  const [pwdForm] = Form.useForm();

  const fetchUsers = async (opts = {}) => {
    setLoading(true);
    try {
      const params = {
        page: opts.page ?? page,
        limit: opts.limit ?? limit,
        q: opts.q ?? q
      };
      const res = await axios.get('/api/users', { params });
      const rows = res?.data?.data?.users || [];
      const count = res?.data?.data?.total || 0;
      setUsers(rows);
      setTotal(count);
    } catch {
      message.error('获取用户列表失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await axios.get('/api/settings');
      const t = Number(res?.data?.data?.quota_low_threshold);
      if (!isNaN(t) && t >= 0 && t <= 1) setLowThreshold(t);
    } catch { message.error('加载设置失败'); }
  };

  useEffect(() => { fetchUsers(); fetchSettings(); }, []);

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      const res = await axios.post('/api/users', values);
      if (res?.data?.success) {
        message.success('用户创建成功');
        setCreateOpen(false);
        form.resetFields();
        fetchUsers({ page: 1 });
      } else {
        message.error(res?.data?.message || '创建失败');
      }
    } catch (err) { if (!err?.errorFields) message.error('创建失败'); }
  };

  const handleUpdate = async (id, payload) => {
    try {
      const res = await axios.put(`/api/users/${id}`, payload);
      if (res?.data?.success) {
        message.success('更新成功');
        fetchUsers();
      } else {
        message.error(res?.data?.message || '更新失败');
      }
    } catch { message.error('更新失败'); }
  };

  const handleDelete = async (id) => {
    try {
      const res = await axios.delete(`/api/users/${id}`);
      if (res?.data?.success) {
        message.success('已删除');
        fetchUsers();
      } else {
        message.error(res?.data?.message || '删除失败');
      }
    } catch { message.error('删除失败'); }
  };

  const openResetPwd = (id) => { setCurrentUserId(id); setResetOpen(true); };
  const submitResetPwd = async () => {
    try {
      const { password } = await pwdForm.validateFields();
      const res = await axios.put(`/api/users/${currentUserId}/password`, { password });
      if (res?.data?.success) {
        message.success('密码已重置');
        setResetOpen(false);
        pwdForm.resetFields();
      } else {
        message.error(res?.data?.message || '重置失败');
      }
    } catch { message.error('重置失败'); }
  };

  function formatDateTimeShort(value: string | number | Date) {
    if (!value) return '-';
    const d = new Date(value);
    if (isNaN(d.getTime())) return value;
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
  }

  const columns = [
    { title: 'ID', dataIndex: 'id', width: 70 },
    { title: '用户名', dataIndex: 'username', ellipsis: true, width: 140 },
    { title: '邮箱', dataIndex: 'email', ellipsis: true, width: 200 },
    { title: '会员等级', dataIndex: 'membership_level', width: 110, render: (level, record) => (
        <Select
          value={level || 'free'}
          size="small"
          style={{ width: 100 }}
          onChange={(val) => handleUpdate(record.id, { membership_level: val })}
          options={[
            { value: 'free', label: '免费' },
            { value: 'pro', label: '专业' },
            { value: 'enterprise', label: '企业' }
          ]}
        />
      )
    },
    { title: '会员到期', dataIndex: 'membership_expires_at', width: 150, render: (v) => v ? formatDateTimeShort(v) : '-' },
    { title: '设置时长(天)', key: 'membership_duration_days', width: 140, render: (_, record) => (
        <Select
          size="small"
          placeholder="选择时长"
          style={{ width: 120 }}
          onChange={(val) => handleUpdate(record.id, { membership_duration_days: val })}
          options={[
            { value: 30, label: '30' },
            { value: 90, label: '90' },
            { value: 180, label: '180' },
            { value: 365, label: '365' }
          ]}
        />
      )
    },
    { title: '检测次数', key: 'quota_detection', width: 160,
      filters: [
        { text: '剩余=0', value: 'zero' },
        { text: `剩余<=${Math.round(lowThreshold*100)}%`, value: 'low' }
      ],
      onFilter: (value, record) => {
        const q = record.quota_summary?.detection;
        if (!q || !q.limit) return value === 'zero' ? q?.remaining === 0 : false;
        const remainingRate = q.remaining / q.limit;
        if (value === 'zero') return q.remaining === 0;
        if (value === 'low') return remainingRate <= lowThreshold;
        return false;
      },
      render: (_, record) => {
        const q = record.quota_summary?.detection;
        if (!q) return '-';
        const rate = q.limit ? (q.remaining / q.limit) : 0;
        const color = q.remaining === 0 ? 'red' : (rate <= lowThreshold ? 'orange' : 'green');
        const text = `${q.used}/${q.limit} 剩余${q.remaining}`;
        return <Tag color={color}>{text}</Tag>;
      }
    },
    { title: '角色', dataIndex: 'role', width: 110, render: (role, record) => (
        <Select
          value={role}
          size="small"
          style={{ width: 100 }}
          onChange={(val) => handleUpdate(record.id, { role: val })}
          options={[{ value: 'user', label: '用户' }, { value: 'admin', label: '管理员' }]}
        />
      )
    },
    { title: '状态', dataIndex: 'status', width: 80, render: (status) => (
        <Tag color={statusColors[status] || 'default'}>
          {status === 'active' ? '启用' : '禁用'}
        </Tag>
      )
    },
    { title: '最近登录', dataIndex: 'last_login', width: 150, render: (v) => formatDateTimeShort(v) },
    { title: '操作', key: 'actions', render: (_, record) => (
        <Space>
          <Button size="small" onClick={() => openResetPwd(record.id)}>重置密码</Button>
          <Button size="small" onClick={() => handleUpdate(record.id, { status: record.status === 'active' ? 'disabled' : 'active' })}>
            {record.status === 'active' ? '禁用' : '启用'}
          </Button>
          <Popconfirm title="确认删除该用户？" onConfirm={() => handleDelete(record.id)}>
            <Button danger size="small">删除</Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <Card title="用户管理" styles={{ header: { padding: '8px 12px' }, body: { padding: 12, display: 'flex', flexDirection: 'column', gap: 12 } }} style={{ flex: 1, minHeight: 0, height: '100%' }} extra={(
          <Space>
            <Space.Compact>
              <Input
                placeholder="搜索用户名或邮箱"
                allowClear
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onPressEnter={() => { fetchUsers({ q, page: 1 }); }}
              />
              <Button type="primary" onClick={() => { fetchUsers({ q, page: 1 }); }}>搜索</Button>
            </Space.Compact>
            <Button type="primary" onClick={() => setCreateOpen(true)}>创建用户</Button>
          </Space>
        )}>
        <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
          <Table
            rowKey="id"
            loading={loading}
            dataSource={users}
            columns={columns}
            size="small"
            tableLayout="fixed"
            scroll={{ x: 'max-content' }}
            pagination={{ current: page, pageSize: limit, total, onChange: (p, l) => { setPage(p); setLimit(l); fetchUsers({ page: p, limit: l }); } }}
          />
        </div>

        <Modal title="创建用户" open={createOpen} onOk={handleCreate} onCancel={() => setCreateOpen(false)} okText="创建">
          <Form form={form} layout="vertical" requiredMark={false}>
            <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }, { min: 3, message: '至少 3 个字符' }]}>
              <Input placeholder="用户名" />
            </Form.Item>
            <Form.Item name="email" label="邮箱" rules={[{ required: true, message: '请输入邮箱' }, { type: 'email', message: '邮箱格式不正确' }]}>
              <Input placeholder="邮箱" />
            </Form.Item>
            <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }, { min: 6, message: '至少 6 位密码' }]}>
              <Input.Password placeholder="密码" />
            </Form.Item>
            <Form.Item name="role" label="角色" initialValue="user">
              <Select options={[{ value: 'user', label: '用户' }, { value: 'admin', label: '管理员' }]} />
            </Form.Item>
            <Form.Item name="membership_level" label="会员等级" initialValue="free">
              <Select options={[{ value: 'free', label: '免费' }, { value: 'pro', label: '专业' }, { value: 'enterprise', label: '企业' }]} />
            </Form.Item>
          </Form>
        </Modal>

        <Modal title="重置密码" open={resetOpen} onOk={submitResetPwd} onCancel={() => setResetOpen(false)} okText="重置">
          <Form form={pwdForm} layout="vertical">
            <Form.Item name="password" label="新密码" rules={[{ required: true, message: '请输入新密码' }, { min: 6, message: '至少 6 位密码' }]}>
              <Input.Password placeholder="新密码" />
            </Form.Item>
          </Form>
        </Modal>
      </Card>
    </div>
  );
}

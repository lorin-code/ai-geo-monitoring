'use client';

import React, { useEffect, useState } from 'react';
import { Card, Table, Space, Button, InputNumber, Modal, Form, message, Tag, Alert, Select } from 'antd';
import Collapsible from '@/components/Collapsible';
import axios from 'axios';

export default function AdminMembershipsPage() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('agd_token') || '' : '';

  const [loading, setLoading] = useState(false);
  const [plans, setPlans] = useState<any[]>([]);
  const [editing, setEditing] = useState<any>(null);
  const [form] = Form.useForm();
  const [defaultForm] = Form.useForm();
  const [savingDefault, setSavingDefault] = useState(false);

  const fetchPlans = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/membership/plans');
      const data = res?.data?.data || [];
      setPlans(data);
    } catch {
      message.error('获取会员方案失败');
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchPlans(); }, []);

  const fetchDefaultLevel = async () => {
    try {
      const res = await axios.get('/api/settings');
      const data = res?.data?.data || {};
      defaultForm.setFieldsValue({
        default_membership_level: data.default_membership_level || 'free',
        quota_low_threshold: Number(data.quota_low_threshold ?? 0.2)
      });
    } catch { message.error('加载默认等级失败'); }
  };
  useEffect(() => { fetchDefaultLevel(); }, []);

  const openEdit = (record: any) => {
    setEditing(record);
    form.setFieldsValue({
      detection_daily_limit: record.detection_daily_limit,
    });
  };

  const submitEdit = async () => {
    try {
      const values = await form.validateFields();
      const level = editing!.level;
      const res = await axios.put(`/api/membership/plans/${level}`, values);
      if (res?.data?.success) {
        message.success('会员方案已更新');
        setEditing(null);
        fetchPlans();
      } else {
        message.error(res?.data?.message || '更新失败');
      }
    } catch { message.error('更新失败'); }
  };

  const columns = [
    { title: '等级', dataIndex: 'level', render: (level: any) => {
      const map = { free: '免费', pro: '专业', enterprise: '企业' };
      const color = level === 'enterprise' ? 'gold' : level === 'pro' ? 'blue' : 'default';
      return <Tag color={color}>{map[level as keyof typeof map] || level}</Tag>;
    } },
    { title: '每日检测次数', dataIndex: 'detection_daily_limit' },
    { title: '操作', key: 'actions', render: (_: any, record: any) => (
      <Space>
        <Button size="small" type="primary" onClick={() => openEdit(record)}>编辑配额</Button>
        <Button size="small" onClick={() => resetDefault(record)}>重置为默认值</Button>
      </Space>
    ) }
  ];

  const resetDefault = async (record: any) => {
    try {
      const res = await axios.post(`/api/membership/plans/${record.level}/reset`);
      if (res?.data?.success) {
        message.success('已重置为默认值');
        fetchPlans();
      } else {
        message.error(res?.data?.message || '重置失败');
      }
    } catch {
      message.error('重置失败');
    }
  };

  const resetAll = async () => {
    try {
      const res = await axios.post('/api/membership/plans/resetAll');
      if (res?.data?.success) {
        message.success('已批量重置为默认值');
        fetchPlans();
      } else {
        message.error(res?.data?.message || '批量重置失败');
      }
    } catch {
      message.error('批量重置失败');
    }
  };

  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      <Card title="会员设置" extra={<Space><Button onClick={fetchDefaultLevel}>刷新</Button><Button type="primary" loading={savingDefault} onClick={async () => {
        try {
          setSavingDefault(true);
          const values = await defaultForm.validateFields();
          const res = await axios.put('/api/settings', {
            default_membership_level: values.default_membership_level,
            quota_low_threshold: values.quota_low_threshold
          });
          if (res?.data?.success) { message.success('默认会员等级已更新'); }
          else { message.error(res?.data?.message || '更新失败'); }
        } catch { message.error('保存失败'); }
        finally { setSavingDefault(false); }
      }}>保存</Button></Space>}>
        <Form form={defaultForm} layout="vertical" requiredMark={false}>
          <Collapsible title="默认会员等级" defaultCollapsed={false} extra={null} className="" style={{}}>
            <Form.Item name="default_membership_level" label="默认会员等级" rules={[{ required: true, message: '请选择默认会员等级' }]}>
              <Select options={[{ value: 'free', label: '免费' }, { value: 'pro', label: '专业' }, { value: 'enterprise', label: '企业' }]} />
            </Form.Item>
          </Collapsible>
          <Collapsible title="配额低剩余提示阈值" defaultCollapsed={false} extra={null} className="" style={{}}>
            <Form.Item name="quota_low_threshold" label="配额低剩余提示阈值" rules={[{ required: true, message: '请输入阈值' }]}>
              <InputNumber min={0} max={1} step={0.05} style={{ width: 200 }} />
            </Form.Item>
          </Collapsible>
        </Form>
      </Card>

      <Card title="会员方案" extra={<Space><Button onClick={fetchPlans}>刷新</Button><Button danger onClick={resetAll}>批量重置为默认值</Button></Space>}>
        <Alert
          style={{ marginBottom: 12 }}
          type="info"
          showIcon
          message="说明"
          description={(
            <div>
              <div>默认配额：免费(每日10)、专业(每日100)、企业(每日1000)。</div>
              <div>可调整配额，如需恢复默认，请使用"重置为默认值"。</div>
            </div>
          )}
        />
        <Table rowKey="id" loading={loading} dataSource={plans} columns={columns} pagination={false} />

        <Modal title={`编辑配额：${editing?.level || ''}`} open={!!editing} onOk={submitEdit} onCancel={() => setEditing(null)} okText="保存">
          <Form form={form} layout="vertical" requiredMark={false}>
            <Form.Item name="detection_daily_limit" label="每日检测次数" rules={[{ required: true, message: '请输入每日检测次数' }]}>
              <InputNumber min={0} step={1} style={{ width: '100%' }} />
            </Form.Item>
          </Form>
        </Modal>
      </Card>
    </Space>
  );
}

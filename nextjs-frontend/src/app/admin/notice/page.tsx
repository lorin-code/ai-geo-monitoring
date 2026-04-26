'use client';

import React, { useEffect, useState } from 'react';
import { Card, Form, Input, Button, message, Space, Typography } from 'antd';
import axios from 'axios';

const { TextArea } = Input;

export default function AdminNoticePage() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('agd_token') || '' : '';

  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);

  const loadData = async () => {
    setLoading(true);
    try {
      let notice = '';
      try {
        const resAdmin = await axios.get('/api/settings');
        notice = String(resAdmin?.data?.data?.system_notice || '');
      } catch {
        const resPublic = await axios.get('/api/settings/notice');
        notice = String(resPublic?.data?.data?.notice || '');
        setUpdatedAt(resPublic?.data?.data?.updated_at || null);
      }
      form.setFieldsValue({ system_notice: notice });
    } catch {
      message.error('加载通知失败');
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const handleSave = async (values: any) => {
    setLoading(true);
    try {
      const payload = { system_notice: values.system_notice || '' };
      await axios.put('/api/settings', payload);
      message.success('系统通知已保存');
      await loadData();
    } catch {
      message.error('保存失败，请稍后重试');
    }
    setLoading(false);
  };

  return (
    <Card title="通知管理" loading={loading}>
      <Typography.Paragraph type="secondary">
        在此编辑系统通知，用户可在 GEO 页左侧菜单进入"系统通知"页面查看。
      </Typography.Paragraph>
      <Form form={form} layout="vertical" onFinish={handleSave}>
        <Form.Item label="系统通知内容" name="system_notice">
          <TextArea rows={8} placeholder="在这里输入系统通知文本（最多5000字符）" />
        </Form.Item>
        <Space>
          <Button type="primary" htmlType="submit">保存</Button>
          <Button onClick={loadData}>刷新</Button>
        </Space>
        {updatedAt && (
          <Typography.Paragraph style={{ marginTop: 12 }} type="secondary">
            最近更新：{(() => { try { return new Date(updatedAt).toLocaleString(); } catch { return String(updatedAt); } })()}
          </Typography.Paragraph>
        )}
      </Form>
    </Card>
  );
}

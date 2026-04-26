'use client';

import React, { useEffect, useState } from 'react';
import { Card, Form, Space, Button, message, Input, Select } from 'antd';
import Collapsible from '@/components/Collapsible';
import axios from 'axios';

export default function AdminSettingsPage() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('agd_token') || '' : '';

  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/settings');
      const data = res?.data?.data || {};
      form.setFieldsValue({
        seo_title: data.seo_title || '',
        seo_description: data.seo_description || '',
        seo_keywords: data.seo_keywords || '',
        seo_robots: data.seo_robots || 'index,follow'
      });
    } catch {
      message.error('获取设置失败');
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchSettings(); }, []);

  const submit = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        seo_title: values.seo_title || '',
        seo_description: values.seo_description || '',
        seo_keywords: values.seo_keywords || '',
        seo_robots: values.seo_robots || 'index,follow'
      };
      const res = await axios.put('/api/settings', payload);
      if (res?.data?.success) {
        message.success('SEO设置已更新');
      } else {
        message.error(res?.data?.message || '更新失败');
      }
    } catch { message.error('保存失败'); }
  };

  return (
    <Card title="系统设置" extra={<Button onClick={fetchSettings}>刷新</Button>}>
      <Form form={form} layout="vertical" requiredMark={false} disabled={loading}>
        <Collapsible title="SEO设置" defaultCollapsed={false} extra={null} className="" style={{}}>
          <Form.Item name="seo_title" label="站点标题（title）" rules={[{ required: true, message: '请输入站点标题' }]}>
            <Input placeholder="示例：AI Geo Detector - 地址地理检测" />
          </Form.Item>
          <Form.Item name="seo_description" label="站点描述（meta description）">
            <Input.TextArea rows={4} placeholder="简要描述站点用途与价值，有助于搜索引擎理解页面" />
          </Form.Item>
          <Form.Item name="seo_keywords" label="关键词（meta keywords）">
            <Input placeholder="用逗号分隔多个关键字，例如：地理检测,AI,地址解析" />
          </Form.Item>
          <Form.Item name="seo_robots" label="Robots 指令">
            <Select
              options={[
                { value: 'index,follow', label: 'index, follow' },
                { value: 'index,nofollow', label: 'index, nofollow' },
                { value: 'noindex,follow', label: 'noindex, follow' },
                { value: 'noindex,nofollow', label: 'noindex, nofollow' }
              ]}
            />
          </Form.Item>
        </Collapsible>
        <Space>
          <Button type="primary" onClick={submit}>保存</Button>
          <Button onClick={fetchSettings}>恢复当前值</Button>
        </Space>
      </Form>
    </Card>
  );
}

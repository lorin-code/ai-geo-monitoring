'use client';

import React, { useEffect, useState } from 'react';
import { Card, Form, Checkbox, Input, Button, Select } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import axios from 'axios';

const PLATFORM_OPTIONS = [
  { value: 'doubao', label: '豆包' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'kimi', label: 'Kimi' },
  { value: 'qianwen', label: '千问' }
];

export default function DetectionForm({ loading, onSubmit }) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('agd_token') || '' : '';

  const [form] = Form.useForm();
  const [platformAvailability, setPlatformAvailability] = useState({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await axios.get('/api/platforms/ping');
        const items = res?.data?.data || [];
        const map = {};
        items.forEach(it => { map[it.platform] = !!it.ok; });
        if (mounted) {
          setPlatformAvailability(map);
          setLoaded(true);
        }
      } catch {
        // 若请求失败，保持默认可选，避免影响正常使用
        if (mounted) setLoaded(true);
      }
    })();
    return () => { mounted = false; };
  }, []);

  return (
    <Card
      title={<span><SettingOutlined style={{ marginRight: 8, color: '#1f4dd2' }} />检测配置</span>}
      style={{ marginBottom: 24 }}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={onSubmit}
        initialValues={{
          platforms: [],
          questions: '',
          highlightKeywords: [],
        }}
      >
        <Form.Item
          label="选择平台"
          name="platforms"
          rules={[{ required: true, message: '请选择至少一个平台' }]}
        >
          <Checkbox.Group
            options={PLATFORM_OPTIONS.map(p => ({
              label: p.label,
              value: p.value,
              disabled: loaded ? platformAvailability[p.value] === false : false
            }))}
            style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}
          />
        </Form.Item>

        <Form.Item
          label="检测问题（每行一个）"
          name="questions"
          rules={[{ required: true, message: '请输入至少一个问题' }]}
        >
          <Input.TextArea
            rows={6}
            placeholder={"每行一个问题，例如：\n什么轮胎好\n米其林和普利司通哪个好"}
            style={{ borderRadius: 8 }}
          />
        </Form.Item>

        <Form.Item
          label="检测关键词"
          name="highlightKeywords"
        >
          <Select
            mode="tags"
            tokenSeparators={[',', '，', ';', '；', '\n']}
            placeholder="输入关键词后按回车，可批量添加"
            style={{ width: '100%' }}
          />
        </Form.Item>

        <Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            loading={loading}
            block
            size="large"
          >
            开始检测
          </Button>
        </Form.Item>
      </Form>
    </Card>
  );
}

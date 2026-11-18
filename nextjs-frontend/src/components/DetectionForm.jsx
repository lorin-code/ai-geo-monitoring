'use client';

import React, { useEffect } from 'react';
import { Card, Form, Checkbox, Input, Button, Select } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import useUserPlatforms from '@/hooks/useUserPlatforms';
import Link from 'next/link';

export default function DetectionForm({ loading, onSubmit }) {
  const [form] = Form.useForm();
  const { availablePlatforms, options, loading: platformsLoading } = useUserPlatforms();

  useEffect(() => {
    form.setFieldValue('platforms', availablePlatforms);
  }, [availablePlatforms, form]);

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
            options={options}
            style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}
          />
        </Form.Item>

        <p><Link href="/geo/profile">配置平台密钥</Link>，校验通过后可选择使用。</p>
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
            disabled={platformsLoading || !availablePlatforms.length}
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

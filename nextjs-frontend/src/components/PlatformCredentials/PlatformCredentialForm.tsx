'use client';

import { useState } from 'react';
import { Alert, Button, Card, Form, Input, Popconfirm, Space, Tag, Typography } from 'antd';
import axios from 'axios';
import { getApiErrorMessage } from '@/utils/apiErrorMessage.cjs';
import { notifyPlatformCredentialsChanged, type UserPlatform } from '@/hooks/useUserPlatforms';

export default function PlatformCredentialForm({ item }: { item: UserPlatform }) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const save = async (values: { api_key: string; model: string }) => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await axios.post(`/api/platforms/${item.platform}/credential`, values, { timeout: 100000 });
      form.setFieldValue('api_key', '');
      setSuccess('校验通过，密钥已保存。现在可以选择该平台。');
      notifyPlatformCredentialsChanged();
    } catch (failure) {
      setError(getApiErrorMessage(failure, '校验或保存失败，请稍后重试'));
    } finally { setSaving(false); }
  };

  const remove = async () => {
    setRemoving(true);
    setError('');
    setSuccess('');
    try {
      await axios.delete(`/api/platforms/${item.platform}/credential`);
      form.setFieldValue('api_key', '');
      setSuccess('密钥已删除，该平台已禁用。');
      notifyPlatformCredentialsChanged();
    } catch (failure) {
      setError(getApiErrorMessage(failure, '删除配置失败'));
    } finally { setRemoving(false); }
  };

  return <Card size="small" title={<Space wrap>{item.name}<Tag color={item.ok ? 'success' : 'default'}>
    {item.ok ? '已校验' : '未配置有效密钥'}</Tag></Space>}
    extra={<a href={item.console_url} target="_blank" rel="noopener noreferrer">获取官方密钥</a>}>
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      <Typography.Text type="secondary">
        {item.configured ? `已保存密钥：${item.masked_key}，模型：${item.model}` : '填写密钥并通过校验后，才能选择此平台。'}
        {item.verified_at && ` · 上次校验：${new Date(item.verified_at).toLocaleString('zh-CN', { hour12: false })}`}
      </Typography.Text>
      <Form form={form} layout="vertical" initialValues={{ model: item.model }} onFinish={save}
        disabled={saving || removing} onValuesChange={() => { setError(''); setSuccess(''); }}>
        <Form.Item name="api_key" label={item.configured ? '新密钥（替换或重新校验）' : 'API 密钥'}
          rules={[{ required: true, whitespace: true, message: '请输入密钥' }]}>
          <Input.Password autoComplete="new-password" placeholder="仅发送到服务器进行校验，不会回显完整密钥" maxLength={512} />
        </Form.Item>
        <Form.Item name="model" label="模型 ID" rules={[{ required: true, whitespace: true, message: '请输入模型 ID' }]}
          extra={item.platform === 'doubao' ? '填写已在火山方舟开通、支持联网搜索的模型 ID 或推理接入点 ep-…' :
            item.platform === 'kimi' ? '使用 Kimi 开放平台密钥，默认 kimi-k3.1-pro；将校验模型调用和官方 Search Basic 权限。' :
            item.platform === 'qianwen' ? '使用阿里云百炼中国内地地域密钥，以及支持联网搜索的千问模型。' : '将同时校验模型调用和联网搜索接口权限。'}>
          <Input autoComplete="off" maxLength={120} />
        </Form.Item>
        <Space wrap>
          <Button type="primary" htmlType="submit" loading={saving}>校验并保存</Button>
          {item.configured && <Popconfirm title={`删除 ${item.name} 密钥？`} description="删除后，新分析和定时任务将无法使用该平台。"
            onConfirm={remove} okText="删除" cancelText="取消">
            <Button danger loading={removing}>删除密钥</Button>
          </Popconfirm>}
        </Space>
      </Form>
      {error && <Alert type="error" showIcon title={error} />}
      {success && <Alert type="success" showIcon title={success} />}
    </Space>
  </Card>;
}

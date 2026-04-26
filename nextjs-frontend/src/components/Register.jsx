'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Card, Form, Input, Button, Typography, message } from 'antd';
import { UserOutlined, LockOutlined, MailOutlined, ReloadOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import axios from 'axios';

const { Title, Paragraph } = Typography;

export default function Register({ onLogin }) {
  const [form] = Form.useForm();
  const router = useRouter();
  const [captchaId, setCaptchaId] = useState('');
  const [captchaSvg, setCaptchaSvg] = useState('');
  const [captchaLoading, setCaptchaLoading] = useState(false);

  const normalizeSvg = (raw) => {
    try {
      const s = String(raw || '');
      if (!s) return s;
      // 为内联 SVG 注入自适应样式，避免在小屏上横向溢出
      return s.replace('<svg', '<svg style="max-width:100%; height:auto; display:block" preserveAspectRatio="xMidYMid meet"');
    } catch {
      return raw || '';
    }
  };

  const loadCaptcha = useCallback(async () => {
    try {
      setCaptchaLoading(true);
      const res = await axios.get('/api/captcha/image');
      const data = res?.data?.data || {};
      setCaptchaId(data.id || '');
      setCaptchaSvg(normalizeSvg(data.svg || ''));
    } catch {
      message.error('验证码加载失败，请稍后重试');
    } finally {
      setCaptchaLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCaptcha();
  }, [loadCaptcha]);

  const handleSubmit = async (values) => {
    // 前置校验：确保验证码已加载（避免未加载或已过期导致的误判）
    const { username, email, password, captcha_answer } = values;
    if (!captchaId) {
      message.warning('验证码未加载或已过期，请刷新后重试');
      await loadCaptcha();
      return;
    }
    try {
      const res = await axios.post('/api/users/register', { username, email, password, captcha_id: captchaId, captcha_answer });
      const ok = res?.data?.success;
      if (!ok) {
        const backendMsg = res?.data?.message;
        message.error(backendMsg || '注册失败');
        // 若后端提示为验证码相关错误，刷新验证码并清空输入
        if (typeof backendMsg === 'string' && /验证码|校验|过期|错误/.test(backendMsg)) {
          await loadCaptcha();
          form.setFieldsValue({ captcha_answer: '' });
        } else {
          // 其他失败也刷新验证码（后端验证已消耗原验证码）
          await loadCaptcha();
          form.setFieldsValue({ captcha_answer: '' });
        }
        return;
      }
      message.success('注册成功，请稍候自动登录');
      // 注册成功后尝试自动登录
      try {
        const loginRes = await axios.post('/api/users/login', { username, password });
        const token = loginRes?.data?.data?.token;
        const user = loginRes?.data?.data?.user;
        if (token && user && onLogin) {
          onLogin({ token, user });
          router.push('/geo');
        } else {
          router.push('/geo');
        }
      } catch {
        router.push('/geo');
      }
    } catch (e) {
      const backendMsg = e?.response?.data?.message;
      message.error(backendMsg || '注册失败，请检查信息是否已被占用');
      // 异常情况下同样刷新验证码并清空输入，避免重复使用同一验证码
      await loadCaptcha();
      form.setFieldsValue({ captcha_answer: '' });
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background:
          'linear-gradient(135deg, #0a1f44 0%, #0f3d7a 45%, #1e66ff 100%)'
      }}
    >
      <Card
        variant="outlined"
        style={{ maxWidth: 480, width: '100%', boxSizing: 'border-box', borderRadius: 12, boxShadow: '0 12px 30px rgba(0,0,0,0.15)' }}
      >
        <Title level={3} style={{ textAlign: 'center', marginBottom: 8 }}>注册新用户</Title>
        <Paragraph style={{ textAlign: 'center', color: '#666', marginBottom: 16 }}>创建账户以使用 GEO 检测工具</Paragraph>
        <Form form={form} layout="vertical" onFinish={handleSubmit} requiredMark={false} size="large">
          <Form.Item name="username" hasFeedback rules={[{ required: true, message: '请输入用户名' }, { min: 3, message: '至少 3 个字符' }]}>
            <Input placeholder="用户名" autoComplete="username" prefix={<UserOutlined />} />
          </Form.Item>
          <Form.Item name="email" hasFeedback rules={[{ required: true, message: '请输入邮箱' }, { type: 'email', message: '邮箱格式不正确' }]}>
            <Input placeholder="邮箱" autoComplete="email" prefix={<MailOutlined />} />
          </Form.Item>
          <Form.Item name="password" hasFeedback rules={[{ required: true, message: '请输入密码' }, { min: 6, message: '至少 6 位密码' }]}>
            <Input.Password placeholder="请输入密码" autoComplete="new-password" prefix={<LockOutlined />} />
          </Form.Item>
          <Form.Item name="confirm" dependencies={["password"]} hasFeedback rules={[{ required: true, message: '请再次输入密码' }, ({ getFieldValue }) => ({ validator(_, value) { if (!value || getFieldValue('password') === value) { return Promise.resolve(); } return Promise.reject(new Error('两次输入的密码不一致')); } })]}>
            <Input.Password placeholder="请再次输入密码" autoComplete="new-password" prefix={<LockOutlined />} />
          </Form.Item>
          <Form.Item name="captcha_answer" hasFeedback rules={[{ required: true, message: '请输入验证码' }]}
            extra={(
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'nowrap', width: '100%', margin: '8px 0 12px 0' }}>
                <div
                  style={{ flex: 1, minWidth: 0, height: 60, border: '1px solid #eee', borderRadius: 8, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  dangerouslySetInnerHTML={{ __html: captchaSvg || '<span style=\'color:#999\'>验证码加载中…</span>' }}
                />
                <Button
                  size="large"
                  icon={<ReloadOutlined />}
                  loading={captchaLoading}
                  onClick={loadCaptcha}
                  style={{ marginLeft: 'auto', height: 60, display: 'flex', alignItems: 'center', borderRadius: 8, padding: '0 16px' }}
                >
                  刷新
                </Button>
              </div>
            )}
          >
            <Input placeholder="请输入验证码（不区分大小写）" autoComplete="off" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block>注册</Button>
          </Form.Item>
          <Form.Item>
            <Button block onClick={() => router.push('/geo')}>返回登录</Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}

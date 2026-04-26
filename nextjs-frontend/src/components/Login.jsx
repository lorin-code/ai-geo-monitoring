'use client';

import React from 'react';
import { Card, Form, Input, Button, Typography, message } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import axios from 'axios';

const { Title, Paragraph } = Typography;

export default function Login({ onLogin, showRegister = true }) {
  const [form] = Form.useForm();
  const router = useRouter();

  const handleSubmit = async (values) => {
    try {
      const res = await axios.post('/api/users/login', {
        username: values.username,
        password: values.password
      });
      const ok = res?.data?.success;
      const token = res?.data?.data?.token;
      const user = res?.data?.data?.user;
      if (!ok || !token) {
        message.error(res?.data?.message || '登录失败');
        return;
      }
      // 交给父组件处理持久化与 axios 默认头设置
      onLogin && onLogin({ token, user });
      message.success('登录成功');
    } catch (e) {
      const backendMsg = e?.response?.data?.message;
      // 针对被禁用场景给出更明确提示；否则展示后端消息或回退到通用提示
      if (typeof backendMsg === 'string' && /禁用|禁止/.test(backendMsg)) {
        message.error('被禁止登录：请联系管理员');
      } else {
        message.error(backendMsg || '登录失败，请检查用户名或密码');
      }
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
        style={{ maxWidth: 440, width: '100%', boxSizing: 'border-box', borderRadius: 12, boxShadow: '0 12px 30px rgba(0,0,0,0.15)' }}
      >
        <Title level={3} style={{ textAlign: 'center', marginBottom: 8 }}>登录 GEO 检测工具</Title>
        <Paragraph style={{ textAlign: 'center', color: '#666', marginBottom: 16 }}>请输入账户信息以使用系统</Paragraph>
        <Form form={form} layout="vertical" onFinish={handleSubmit} requiredMark={false} size="large">
          <Form.Item name="username" label="用户名或邮箱" hasFeedback rules={[{ required: true, message: '请输入用户名或邮箱' }, { min: 3, message: '至少 3 个字符' }]}>
            <Input placeholder="用户名或邮箱" autoComplete="username" prefix={<UserOutlined />} />
          </Form.Item>
          <Form.Item name="password" label="密码" hasFeedback rules={[{ required: true, message: '请输入密码' }, { min: 6, message: '至少 6 位密码' }]}>
            <Input.Password placeholder="请输入密码" autoComplete="current-password" prefix={<LockOutlined />} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block>登录</Button>
          </Form.Item>
          <Form.Item>
            <Button block onClick={() => router.push('/')}>返回首页</Button>
          </Form.Item>
          {showRegister && (
            <Form.Item>
              <Button block onClick={() => router.push('/register')}>没有账户？注册</Button>
            </Form.Item>
          )}
        </Form>
      </Card>
    </div>
  );
}

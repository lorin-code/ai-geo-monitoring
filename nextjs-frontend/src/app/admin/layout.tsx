'use client';

import React, { useState, useEffect } from 'react';
import { Layout, Button, Space, Menu, message } from 'antd';
import { useRouter, useParams, usePathname } from 'next/navigation';
import { MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons';
import Login from '@/components/Login';
import axios from 'axios';
import { setAuthToken, clearAuth } from '@/lib/axiosConfig';

const { Header, Sider, Content } = Layout;

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const params = useParams();
  const [collapsed, setCollapsed] = useState(false);
  const [token, setToken] = useState('');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // 从 localStorage 读取用户信息
  useEffect(() => {
    const storedToken = localStorage.getItem('agd_token') || '';
    const storedUser = localStorage.getItem('agd_user');
    setToken(storedToken);
    if (storedUser) {
      try {
        const user = JSON.parse(storedUser);
        setCurrentUser(user);
      } catch {
        setCurrentUser(null);
      }
    }

    setLoading(false);
  }, []);

  const handleLogin = ({ token: tk, user }: { token: string; user: any }) => {
    setToken(tk);
    setCurrentUser(user);
    localStorage.setItem('agd_token', tk);
    localStorage.setItem('agd_user', JSON.stringify(user || null));
    if (user?.id) localStorage.setItem('agd_user_id', String(user.id));
    setAuthToken(tk);
  };

  const handleLogout = () => {
    setToken('');
    setCurrentUser(null);
    clearAuth();
    message.success('已退出登录');
  };

  // 获取当前选中的菜单项
  const pathname = usePathname();

  const menuItems = [
    { key: 'dashboard', label: '数据仪表' },
    { key: 'history', label: '历史记录' },
    { key: 'users', label: '用户管理' },
    { key: 'platforms', label: '平台自检' },
    { key: 'memberships', label: '会员设置' },
    { key: 'settings', label: '系统设置' },
    { key: 'notice', label: '通知管理' },
    { key: 'health', label: '系统健康' },
  ];

  let selectedKey = 'dashboard';

  if (pathname.startsWith('/admin/')) {
    // 提取 /admin/ 后面的部分，如 /admin/memberships -> memberships
    const pathWithoutPrefix = pathname.replace('/admin/', '');
    const firstSegment = pathWithoutPrefix.split('/')[0];
    if (firstSegment && menuItems.some(item => item.key === firstSegment)) {
      selectedKey = firstSegment;
    }
  } else if (pathname === '/admin') {
    selectedKey = 'dashboard';
  }

  const handleMenuClick = ({ key }: { key: string }) => {
    if (key === 'dashboard') {
      router.push('/admin');
    } else {
      router.push(`/admin/${key}`);
    }
  };

  // 加载中
  if (loading) {
    return <div style={{ textAlign: 'center', padding: '100px 0' }}>加载中...</div>;
  }

  // 未登录时显示登录页面
  if (!token || !currentUser) {
    return <Login onLogin={handleLogin} showRegister={false} />;
  }

  // 验证管理员权限
  if (currentUser.role !== 'admin') {
    message.error('无权访问管理员后台');
    router.push('/');
    return null;
  }

  return (
    <Layout className="layout">
      <Header className="app-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="logo" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button
            type="text"
            aria-label={collapsed ? '展开侧栏' : '折叠侧栏'}
            icon={collapsed ? <MenuUnfoldOutlined style={{ color: '#fff' }} /> : <MenuFoldOutlined style={{ color: '#fff' }} />}
            onClick={() => setCollapsed(!collapsed)}
          />
          <span>管理员后台</span>
        </div>
        <Space>
          <Button onClick={() => router.push('/')}>返回首页</Button>
          <Button onClick={handleLogout}>退出登录</Button>
        </Space>
      </Header>
      <Layout style={{ marginTop: 64 }}>
        <Sider
          width={200}
          collapsedWidth={0}
          theme="light"
          collapsible
          collapsed={collapsed}
          onCollapse={(val) => setCollapsed(val)}
          trigger={null}
          style={{ background: '#fff' }}
        >
          <Menu
            mode="inline"
            selectedKeys={[selectedKey]}
            style={{ height: '100%', borderRight: 0 }}
            items={menuItems}
            onClick={handleMenuClick}
          />
        </Sider>
        <Content style={{ padding: 24 }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  );
}

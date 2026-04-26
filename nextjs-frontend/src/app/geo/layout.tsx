'use client';

import React, { useState, useEffect } from 'react';
import { Layout, Menu, Breadcrumb, Button, Space } from 'antd';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import Login from '@/components/Login';
import { message } from 'antd';
import axios from 'axios';
import { setAuthToken, clearAuth } from '@/lib/axiosConfig';
import { MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons';

const { Header, Content, Sider } = Layout;

export default function GeoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
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
        setCurrentUser(JSON.parse(storedUser));
      } catch {
        setCurrentUser(null);
      }
    }

    setLoading(false);
  }, []);

  // 设置页面 title（必须在所有条件返回之前）
  useEffect(() => {
    if (pathname.startsWith('/geo')) {
      document.title = 'Goodie AI - 实时查询';
    }
  }, [pathname]);

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

  // 根据当前路径确定选中的菜单项和面包屑
  const selectedKey = pathname.replace('/geo', '') || '/';
  const basePath = '/geo';

  // 面包屑配置
  const breadcrumbMap: Record<string, { path: string; label: string }> = {
    '/': { path: basePath, label: '实时查询' },
    '/tasks': { path: `${basePath}/tasks`, label: '定时查询' },
    '/history': { path: `${basePath}/history`, label: '历史记录' },
    '/dashboard': { path: `${basePath}/dashboard`, label: '数据仪表' },
    '/notice': { path: `${basePath}/notice`, label: '系统通知' },
    '/profile': { path: `${basePath}/profile`, label: '个人中心' },
  };

  // 构建面包屑数组
  const breadcrumbItems = [
    { path: basePath, label: '实时查询' },
    selectedKey === '/' ? null : breadcrumbMap[selectedKey]
  ].filter(Boolean);

  // 菜单项配置
  const menuItems = [
    { key: '/', label: <Link href="/geo">实时查询</Link> },
    { key: '/tasks', label: <Link href="/geo/tasks">定时查询</Link> },
    { key: '/history', label: <Link href="/geo/history">历史记录</Link> },
    { key: '/dashboard', label: <Link href="/geo/dashboard">数据仪表</Link> },
    { key: '/notice', label: <Link href="/geo/notice">系统通知</Link> },
    { key: '/profile', label: <Link href="/geo/profile">个人中心</Link> },
  ];

  // 未登录时显示登录页面（条件渲染必须在所有 Hooks 之后）
  if (loading) {
    return <div style={{ textAlign: 'center', padding: '100px 0' }}>加载中...</div>;
  }

  if (!token) {
    return <Login onLogin={handleLogin} showRegister={true} />;
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
          <span>实时查询</span>
        </div>
        <Space>
          <Button onClick={() => router.push('/')}>返回首页</Button>
          <Button onClick={handleLogout}>退出登录</Button>
        </Space>
      </Header>
      <Layout style={{ marginTop: 64 }}>
        <Sider
          width={220}
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
            selectedKeys={[selectedKey || '/']}
            style={{ height: '100%', borderRight: 0 }}
            items={menuItems}
          />
        </Sider>
        <Content style={{ padding: 24 }}>
          <Breadcrumb
            style={{ margin: '8px 0' }}
            items={breadcrumbItems.map((item: any) => ({
              title: <Link href={item.path}>{item.label}</Link>
            }))}
          />
          {children}
        </Content>
      </Layout>
    </Layout>
  );
}

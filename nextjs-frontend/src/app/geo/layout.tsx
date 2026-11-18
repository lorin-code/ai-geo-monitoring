'use client';

import React, { useState, useEffect } from 'react';
import { Layout, Menu, Breadcrumb, Button, Space } from 'antd';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import Login from '@/components/Login';
import { message } from 'antd';
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
  const [loading, setLoading] = useState(true);

  // 从 localStorage 读取用户信息
  useEffect(() => {
    const storedToken = localStorage.getItem('agd_token') || '';
    setToken(storedToken);
    setLoading(false);
  }, []);

  // 设置页面 title（必须在所有条件返回之前）
  useEffect(() => {
    if (pathname.startsWith('/geo')) {
      document.title = 'Goodie AI - GEO 项目工作台';
    }
  }, [pathname]);

  const handleLogin = ({ token: tk, user }: { token: string; user: any }) => {
    setToken(tk);
    localStorage.setItem('agd_token', tk);
    localStorage.setItem('agd_user', JSON.stringify(user || null));
    if (user?.id) localStorage.setItem('agd_user_id', String(user.id));
    setAuthToken(tk);
  };

  const handleLogout = () => {
    setToken('');
    clearAuth();
    message.success('已退出登录');
  };

  // 根据当前路径确定选中的菜单项和面包屑
  const selectedKey = pathname.replace('/geo', '') || '/';
  const basePath = '/geo';

  // 面包屑配置
  const breadcrumbMap: Record<string, { path: string; label: string }> = {
    '/projects': { path: `${basePath}/projects`, label: '品牌项目' },
    '/prompts': { path: `${basePath}/prompts`, label: 'Prompt 库' },
    '/project-dashboard': { path: `${basePath}/project-dashboard`, label: '项目看板' },
    '/sources': { path: `${basePath}/sources`, label: '来源分析' },
    '/reports': { path: `${basePath}/reports`, label: '报告中心' },
    '/rankings': { path: `${basePath}/rankings`, label: '品牌排名' },
    '/alerts': { path: `${basePath}/alerts`, label: '告警设置' },
    '/notice': { path: `${basePath}/notice`, label: '系统通知' },
    '/profile': { path: `${basePath}/profile`, label: '个人中心' },
  };

  // 构建面包屑数组
  const workspaceCrumb = { path: `${basePath}/projects`, label: 'GEO 工作台' };
  const breadcrumbItems = [
    workspaceCrumb,
    selectedKey === '/projects' ? null : breadcrumbMap[selectedKey]
  ].filter(Boolean);

  // 菜单项配置
  const menuItems = [
    { key: '/projects', label: <Link href="/geo/projects">品牌项目</Link> },
    { key: '/prompts', label: <Link href="/geo/prompts">Prompt 库</Link> },
    { key: '/project-dashboard', label: <Link href="/geo/project-dashboard">项目看板</Link> },
    { key: '/sources', label: <Link href="/geo/sources">来源分析</Link> },
    { key: '/reports', label: <Link href="/geo/reports">报告中心</Link> },
    { key: '/rankings', label: <Link href="/geo/rankings">品牌排名</Link> },
    { key: '/alerts', label: <Link href="/geo/alerts">告警设置</Link> },
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
          <span>GEO 项目工作台</span>
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
            selectedKeys={[breadcrumbMap[selectedKey] ? selectedKey : '/projects']}
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

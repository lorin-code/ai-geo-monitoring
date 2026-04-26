'use client';

import React from 'react';
import { Space, Button, Dropdown } from 'antd';
import { ThunderboltOutlined, DownOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';

const goodieLogo = '/assets/goodie-logo.svg';

export default function Header({ token, onLogout, isGeoRoute = false }) {
  const router = useRouter();

  return (
    <header className="app-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div className="logo" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <img src={goodieLogo} alt="Goodie AI logo" className="site-logo" />
      </div>

      {isGeoRoute ? (
        <Space>
          <Button size="middle" onClick={() => router.push('/')}>返回首页</Button>
          {onLogout && <Button size="middle" onClick={onLogout}>退出登录</Button>}
        </Space>
      ) : (
        <Space>
          <Dropdown
            menu={{
              items: [
                { key: 'geo', label: 'GEO 检测工具' },
                { key: 'writer', label: 'AI 文章撰写工具' },
              ],
              onClick: ({ key }) => {
                if (key === 'geo') router.push('/geo');
                if (key === 'writer') router.push('/tools/writer');
              }
            }}
            placement="bottomRight"
            trigger={['hover']}
          >
            <span style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }} aria-label="产品菜单">
              产品 <DownOutlined />
            </span>
          </Dropdown>
          <Button type="primary" size="middle" icon={<ThunderboltOutlined />} onClick={() => router.push('/geo')}>
            开始 GEO 检查
          </Button>
        </Space>
      )}
    </header>
  );
}

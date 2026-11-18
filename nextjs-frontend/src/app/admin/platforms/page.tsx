'use client';

import React, { useEffect, useState } from 'react';
import { Card, Tag, Space, Button, message, Typography } from 'antd';
import axios from 'axios';
import Link from 'next/link';

const { Paragraph } = Typography;

export default function AdminPlatformsPage() {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<any[]>([]);

  const fetchPing = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/platforms/ping');
      const data = res?.data?.data || [];
      setItems(data);
    } catch {
      message.error('获取平台状态失败');
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchPing(); }, []);

  return (
    <Card title="平台配置" extra={<Button onClick={fetchPing}>刷新</Button>}>
      <Paragraph type="secondary" style={{ marginBottom: 16 }}>
        以下为当前账号的平台配置状态。请在<Link href="/geo/profile">个人中心</Link>填写密钥并校验，通过后可选择使用。
      </Paragraph>
      {loading ? (
        <div style={{ textAlign: 'center', padding: '20px' }}>加载中...</div>
      ) : (
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          {items.map((item: any, index: number) => (
            <div
              key={index}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '12px 16px',
                border: '1px solid #f0f0f0',
                borderRadius: '8px',
                backgroundColor: '#fff'
              }}
            >
              <div>
                <div style={{ fontWeight: 500, fontSize: '16px', marginBottom: '4px' }}>{item.name}</div>
                <div style={{ color: '#666', fontSize: '14px' }}>
                  标识：{item.platform} ｜ 接口：{item.apiUrl}
                </div>
              </div>
              <Space>
                <Tag color={item.ok ? 'green' : 'red'}>{item.ok ? '服务凭证已配置' : '未配置'}</Tag>
                <span style={{ color: '#999' }}>{item.message}</span>
              </Space>
            </div>
          ))}
        </Space>
      )}
    </Card>
  );
}

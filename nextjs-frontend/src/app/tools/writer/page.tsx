'use client';

import React from 'react';
import { Card, Typography, Space, Button } from 'antd';
import { FileTextOutlined, ThunderboltOutlined, HomeOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';

const { Title, Paragraph } = Typography;

export default function WriterPage() {
  const router = useRouter();
  return (
    <div className="page-container" style={{ padding: 24, marginTop: 64 }}>
      <Card style={{ maxWidth: 880, margin: '0 auto' }}>
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <Title level={2} style={{ marginBottom: 0 }}>
            AI 文章撰写工具
          </Title>
          <Paragraph type="secondary">
            我们正在打造一款帮助你快速生成高质量文章的工具，支持主题规划、结构提纲、风格调优、引用与参考增强等功能。功能即将上线，敬请期待。
          </Paragraph>
          <div style={{ display: 'flex', gap: 12 }}>
            <Button type="primary" icon={<ThunderboltOutlined />} onClick={() => router.push('/geo')}>
              开始 GEO 检查
            </Button>
            <Button icon={<HomeOutlined />} onClick={() => router.push('/')}>返回首页</Button>
          </div>
        </Space>
      </Card>
    </div>
  );
}

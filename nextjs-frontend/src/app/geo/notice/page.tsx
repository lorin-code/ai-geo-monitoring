'use client';

import React, { useEffect, useState } from 'react';
import { Card, Typography, Alert, Space, Button, Skeleton } from 'antd';
import axios from 'axios';

export default function GeoNoticePage() {
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const API_BASE = (
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:3000'
  ).replace(/\/$/, '');

  const fetchNotice = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/settings/notice`);
      const data = res?.data?.data || {};
      setNotice(String(data.notice || ''));
      setUpdatedAt(data.updated_at || null);
    } catch {
      // no-op
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchNotice(); }, []);

  const formatTime = (ts: string | null) => {
    if (!ts) return '';
    try { return new Date(ts).toLocaleString(); } catch { return String(ts); }
  };

  return (
    <Space orientation="vertical" size="middle">
      <Card title="系统通知" extra={<Button onClick={fetchNotice}>刷新</Button>}>
        {loading ? (
          <Skeleton active paragraph={{ rows: 3 }} />
        ) : (
          notice ? (
            <Typography.Paragraph style={{ whiteSpace: 'pre-wrap' }}>
              {notice}
            </Typography.Paragraph>
          ) : (
            <Alert type="info" message="当前暂无系统通知" showIcon />
          )
        )}
        {updatedAt && (
          <Typography.Text type="secondary">最近更新：{formatTime(updatedAt)}</Typography.Text>
        )}
      </Card>
    </Space>
  );
}

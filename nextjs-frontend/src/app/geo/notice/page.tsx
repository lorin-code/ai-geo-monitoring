'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Card, Typography, Alert, Space, Button, Skeleton } from 'antd';
import axios from 'axios';

export default function GeoNoticePage() {
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const fetchNotice = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/settings/notice');
      const data = res?.data?.data || {};
      setNotice(String(data.notice || ''));
      setUpdatedAt(data.updated_at || null);
    } catch {
      // no-op
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchNotice(); }, [fetchNotice]);

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
            <Alert type="info" title="当前暂无系统通知" showIcon />
          )
        )}
        {updatedAt && (
          <Typography.Text type="secondary">最近更新：{formatTime(updatedAt)}</Typography.Text>
        )}
      </Card>
    </Space>
  );
}

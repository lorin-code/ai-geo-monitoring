'use client';

import React, { useEffect, useState } from 'react';
import { Card, Descriptions, Badge, Button, message } from 'antd';
import axios from 'axios';

export default function AdminHealthPage() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('agd_token') || '' : '';

  const [loading, setLoading] = useState(false);
  const [health, setHealth] = useState({ status: '-', timestamp: '-', version: '-' });

  const fetchHealth = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/health');
      const data = res?.data || {};
      setHealth({
        status: data.status || '-',
        timestamp: data.timestamp || '-',
        version: data.version || '-',
      });
    } catch {
      message.error('获取系统健康信息失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchHealth(); }, []);

  function formatDateTimeShort(value: string | number | Date) {
    if (!value) return '-';
    const d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
  }

  return (
    <Card title="系统健康" extra={<Button loading={loading} onClick={fetchHealth}>刷新</Button>}>
      <Descriptions column={1} bordered size="small">
        <Descriptions.Item label="后端状态">
          <Badge status={health.status === 'OK' ? 'success' : 'error'} text={health.status} />
        </Descriptions.Item>
        <Descriptions.Item label="时间戳">{formatDateTimeShort(health.timestamp)}</Descriptions.Item>
        <Descriptions.Item label="版本">{health.version}</Descriptions.Item>
      </Descriptions>
    </Card>
  );
}

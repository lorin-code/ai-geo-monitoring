// @ts-nocheck
'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Card, Descriptions, Space, Button, Tag, Statistic, message } from 'antd';
import axios from 'axios';

const levelColors = {
  free: 'default',
  basic: 'blue',
  pro: 'gold',
  enterprise: 'purple'
};

export default function GeoProfilePage() {
  const userId = Number(typeof window !== 'undefined' ? localStorage.getItem('agd_user_id') || 0 : 0);
  const token = typeof window !== 'undefined' ? localStorage.getItem('agd_token') || '' : '';

  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState(null);
  const [quota, setQuota] = useState(null);

  const formatDateTimeShort = (v) => {
    try {
      const d = new Date(v);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `${y}-${m}-${dd} ${hh}:${mm}`;
    } catch {
      return String(v || '-');
    }
  };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, qRes] = await Promise.all([
        axios.get(`/api/users/profile/${userId}`),
        axios.get(`/api/users/quota/${userId}`)
      ]);
      setProfile(pRes?.data?.data || null);
      setQuota(qRes?.data?.data || null);
    } catch {
      message.error('获取个人信息失败');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const level = quota?.membership_level || profile?.membership_level || 'free';
  const qs = quota?.quota_summary || {};
  const expiresAt = quota?.membership_expires_at || profile?.membership_expires_at || null;
  const remainingDays = (() => {
    const lv = String(level).toLowerCase();
    if (lv === 'free') return '长期有效';
    if (!expiresAt) return '-';
    try {
      const now = Date.now();
      const end = new Date(expiresAt).getTime();
      const diffMs = end - now;
      if (diffMs <= 0) return 0;
      return Math.ceil(diffMs / (24 * 60 * 60 * 1000));
    } catch {
      return '-';
    }
  })();

  const levelLabelMap = { free: '免费', basic: '基础', pro: '专业', enterprise: '企业' };
  const levelLabel = levelLabelMap[String(level).toLowerCase()] || level;

  return (
    <Space orientation="vertical" size="large" style={{ width: '100%' }}>
      <Card
        title="个人信息"
        loading={loading}
        extra={<Button onClick={fetchAll}>刷新</Button>}
      >
        <Descriptions column={1} size="small" styles={{ label: { width: 120 } }}>
          <Descriptions.Item label="用户ID">{profile?.user_id ?? userId}</Descriptions.Item>
          <Descriptions.Item label="昵称">{profile?.nickname || profile?.username || '-'}</Descriptions.Item>
          <Descriptions.Item label="邮箱">{profile?.email || '-'}</Descriptions.Item>
          <Descriptions.Item label="角色">{profile?.role || '-'}</Descriptions.Item>
          <Descriptions.Item label="会员等级">
            <Tag color={levelColors[String(level).toLowerCase()] || 'default'}>{levelLabel}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="会员时长">
            {String(level).toLowerCase() === 'free'
              ? (<Tag>长期有效</Tag>)
              : (expiresAt ? `${formatDateTimeShort(expiresAt)}` : '-')}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="配额与使用情况" loading={loading}>
        <Space size="large" wrap>
          <Statistic title="本日已用" value={(qs?.detection?.used ?? 0)} suffix="次检测" />
          <Statistic title="本日上限" value={(qs?.detection?.limit ?? 0)} suffix="次检测" />
          <Statistic title="本日剩余" value={(qs?.detection?.remaining ?? 0)} suffix="次检测" />
          <Statistic title="剩余天数" value={remainingDays} suffix={typeof remainingDays === 'number' ? '天' : undefined} />
        </Space>
      </Card>

      <Card title="说明">
        <div style={{ color: '#666' }}>
          - 会员等级影响每日与每月检测额度。
          <br />
          - 如需提升额度，请在会员中心升级计划或联系管理员。
        </div>
      </Card>
    </Space>
  );
}

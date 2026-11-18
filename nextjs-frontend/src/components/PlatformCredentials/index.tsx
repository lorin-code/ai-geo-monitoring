'use client';

import { Alert, Button, Card, Skeleton, Space, Typography } from 'antd';
import useUserPlatforms from '@/hooks/useUserPlatforms';
import PlatformCredentialForm from './PlatformCredentialForm';

export default function PlatformCredentials() {
  const { items, loading, error, refresh } = useUserPlatforms();
  return <Card title="模型密钥" extra={<Button loading={loading} onClick={refresh}>刷新配置</Button>}>
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      <Typography.Paragraph type="secondary">
        每个账号使用自己的官方密钥；密钥校验通过后才会保存并启用平台。校验会发起少量真实模型及搜索请求，费用由对应平台账号承担。
        保存的密钥加密存储，仅显示末四位。更换密钥校验失败时保留原配置。
      </Typography.Paragraph>
      {error && <Alert type="error" title={error} showIcon action={<Button onClick={refresh}>重试</Button>} />}
      {loading && !items.length ? <Skeleton active /> : items.map((item) => <PlatformCredentialForm key={item.platform} item={item} />)}
    </Space>
  </Card>;
}

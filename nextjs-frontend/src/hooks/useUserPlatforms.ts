'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { getApiErrorMessage } from '@/utils/apiErrorMessage.cjs';
import { MONITORING_PLATFORM_OPTIONS } from '@/utils/monitoringPlatforms.cjs';

export type UserPlatform = {
  platform: string; name: string; model: string; ok: boolean; configured: boolean;
  masked_key: string; verified_at: string | null; console_url: string; message: string;
};

export function notifyPlatformCredentialsChanged() {
  window.dispatchEvent(new Event('platform-credentials-changed'));
}

export default function useUserPlatforms() {
  const [items, setItems] = useState<UserPlatform[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestRef = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++requestRef.current;
    setLoading(true);
    try {
      const response = await axios.get('/api/platforms/ping');
      if (requestRef.current !== request) return;
      setItems(response.data.data || []);
      setError('');
    } catch (failure) {
      if (requestRef.current !== request) return;
      setItems([]);
      setError(getApiErrorMessage(failure, '获取模型配置失败'));
    } finally {
      if (requestRef.current === request) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onChange = () => { void refresh(); };
    void refresh();
    window.addEventListener('platform-credentials-changed', onChange);
    window.addEventListener('focus', onChange);
    return () => {
      requestRef.current += 1;
      window.removeEventListener('platform-credentials-changed', onChange);
      window.removeEventListener('focus', onChange);
    };
  }, [refresh]);

  const availablePlatforms = useMemo(() => loading ? [] : items.filter((item) => item.ok).map((item) => item.platform), [loading, items]);
  const options = MONITORING_PLATFORM_OPTIONS.map((item) => ({ ...item,
    disabled: !availablePlatforms.includes(item.value),
    label: availablePlatforms.includes(item.value) ? item.label : `${item.label}（未配置有效密钥）`,
  }));
  return { items, loading, error, refresh, availablePlatforms, options };
}

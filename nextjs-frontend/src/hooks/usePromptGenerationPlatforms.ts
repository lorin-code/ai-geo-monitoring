'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import { getApiErrorMessage } from '@/utils/apiErrorMessage.cjs';

type GenerationPlatform = { platform: string; name: string; model: string; available: boolean };

export default function usePromptGenerationPlatforms(projectId: number | null) {
  const [state, setState] = useState<{
    projectId: number | null; items: GenerationPlatform[]; preferred: string | null; loading: boolean; error: string;
  }>({ projectId: null, items: [], preferred: null, loading: false, error: '' });
  const [selected, setSelected] = useState<string | null>(null);
  const [refreshIndex, setRefreshIndex] = useState(0);

  useEffect(() => {
    if (!projectId) return;
    let controller: AbortController | undefined;
    let disposed = false;
    const refresh = async () => {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      setState({ projectId, items: [], preferred: null, loading: true, error: '' });
      try {
        const response = await axios.get(`/api/geo-projects/${projectId}/prompts/generation-platforms`, { signal: request.signal });
        if (disposed || request.signal.aborted) return;
        setState({ projectId, items: response.data.data.platforms, preferred: response.data.data.default_platform,
          loading: false, error: '' });
      } catch (failure) {
        if (!disposed && !request.signal.aborted) {
          setState({ projectId, items: [], preferred: null, loading: false,
            error: getApiErrorMessage(failure, '获取生成模型失败，请重试') });
        }
      }
    };
    const onRefresh = () => { void refresh(); };
    onRefresh();
    window.addEventListener('focus', onRefresh);
    window.addEventListener('platform-credentials-changed', onRefresh);
    return () => {
      disposed = true;
      controller?.abort();
      window.removeEventListener('focus', onRefresh);
      window.removeEventListener('platform-credentials-changed', onRefresh);
    };
  }, [projectId, refreshIndex]);

  const current = state.projectId === projectId && projectId !== null;
  const items = current ? state.items : [];
  const platform = items.some((item) => item.available && item.platform === selected) ? selected : (current ? state.preferred : null);
  return { items, platform, setPlatform: setSelected,
    loading: Boolean(projectId) && (!current || state.loading), error: current ? state.error : '',
    retry: () => setRefreshIndex((index) => index + 1) };
}

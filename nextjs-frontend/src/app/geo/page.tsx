// @ts-nocheck
'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Layout, Spin, Row, Col, message } from 'antd';
import axios from 'axios';
import DetectionForm from '@/components/DetectionForm';
import ResultsDisplay from '@/components/ResultsDisplay';
import Footer from '@/components/Footer';

const { Content } = Layout;

const PLATFORM_OPTIONS = [
  { value: 'doubao', label: '豆包' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'kimi', label: 'Kimi' },
  { value: 'qianwen', label: '千问' }
];

export default function GeoPage() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [highlightKeywords, setHighlightKeywords] = useState([]);
  const [remainingTasks, setRemainingTasks] = useState(0);
  const sseRefs = useRef({});
  const pollingRefs = useRef({});

  const token = typeof window !== 'undefined' ? localStorage.getItem('agd_token') || '' : '';
  const userId = Number(typeof window !== 'undefined' ? localStorage.getItem('agd_user_id') || 0 : 0);

  const sanitizeDelta = (platform, chunk) => {
    const s = String(chunk || '');
    if (!s) return '';
    return s.replace(/```[\s\S]*?```/g, '').replace(/\*\*|__|\*|_/g, '');
  };

  const API_BASE_URL = (
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:3000'
  ).replace(/\/$/, '');

  const handleStreamConnection = (platform, question, keywordsOverride) => {
    try {
      const kwList = Array.isArray(keywordsOverride) ? keywordsOverride : (Array.isArray(highlightKeywords) ? highlightKeywords : []);
      const brandStr = kwList.filter(Boolean).join(',');
      const safeBase = API_BASE_URL.replace(/\/$/, '');
      // 修复 SSE URL 构建：添加对相对 URL 的 origin 处理
      const baseUrl = safeBase.startsWith('http://') || safeBase.startsWith('https://')
        ? safeBase
        : `${window.location.origin}${safeBase}`;
      const url = `${baseUrl}/api/detection/stream?user_id=${userId}&platform=${platform}&question=${encodeURIComponent(question)}&brand_keywords=${encodeURIComponent(brandStr)}&token=${encodeURIComponent(token)}`;
      const es = new EventSource(url);

      sseRefs.current[`${platform}-${question}`] = es;

      let accText = '';
      setResults(prev => {
        const exists = prev.find(r => r.platform === platform && r.question === question);
        return exists ? prev : [...prev, { platform, question, originalText: '' }];
      });

      es.onmessage = (evt) => {
        try {
          const payload = JSON.parse(evt.data || '{}');
          if (payload.event === 'delta') {
            const raw = payload.content || '';
            const vis = sanitizeDelta(platform, raw);
            accText += raw;
            if (vis !== '') {
              setResults(prev => prev.map(r => (
                r.platform === platform && r.question === question
                  ? { ...r, originalText: accText }
                  : r
              )));
            }
          } else if (payload.event === 'error') {
            if (es && typeof es.close === 'function') es.close();
            delete sseRefs.current[`${platform}-${question}`];
            message.error(payload.message || `${platform} 流式传输发生错误`);
            if (Object.keys(sseRefs.current).length === 0) setLoading(false);
          } else if (payload.event === 'done') {
            es.close();
            delete sseRefs.current[`${platform}-${question}`];
            message.success(`${platform} 流式结果接收完成`);
            if (Object.keys(sseRefs.current).length === 0) setLoading(false);
          }
        } catch {
          const raw = (evt.data || '');
          const vis = sanitizeDelta(platform, raw);
          accText += raw;
          if (vis !== '') {
            setResults(prev => prev.map(r => (
              r.platform === platform && r.question === question
                ? { ...r, originalText: accText }
                : r
            )));
          }
        }
      };

      es.onerror = (e) => {
        console.warn('SSE 发生错误:', e);
        if (es && typeof es.close === 'function') es.close();
        delete sseRefs.current[`${platform}-${question}`];
        message.error(`${platform} 流式传输发生错误`);
        if (Object.keys(sseRefs.current).length === 0) setLoading(false);
      };
    } catch (e) {
      console.error('启动流式失败:', e);
      message.error('无法启动流式传输');
      setLoading(false);
    }
  };

  const mapStatusToResult = (data) => {
    const detail = data.result_detail || {};
    return {
      platform: data.platform,
      question: data.question,
      originalText: detail.ai_response_original || '',
      brandKeywords: []
    };
  };

  const startPollingRecord = (recordId) => {
    pollingRefs.current[recordId] = { attempts: 0, timerId: null };
    const check = async () => {
      try {
        const res = await axios.get(`/api/detection/status/${recordId}`);
        const data = res?.data?.data;
        if (!data) return;
        if (data.status === 'completed') {
          const resultItem = mapStatusToResult(data);
          setResults(prev => {
            const key = `${resultItem.platform}-${resultItem.question}`;
            const exists = prev.find(r => `${r.platform}-${r.question}` === key);
            return exists ? prev : [...prev, resultItem];
          });
          clearInterval(pollingRefs.current[recordId].timerId);
          delete pollingRefs.current[recordId];
          setRemainingTasks(prev => Math.max(0, prev - 1));
          message.success(`${data.platform} 检测完成`);
        } else if (data.status === 'failed') {
          clearInterval(pollingRefs.current[recordId].timerId);
          delete pollingRefs.current[recordId];
          setRemainingTasks(prev => Math.max(0, prev - 1));
          message.error(`${data.platform} 检测失败：${data.error_message || '未知错误'}`);
        } else {
          const ref = pollingRefs.current[recordId];
          if (ref) {
            ref.attempts += 1;
            if (ref.attempts >= 120) {
              clearInterval(ref.timerId);
              delete pollingRefs.current[recordId];
              setRemainingTasks(prev => Math.max(0, prev - 1));
              message.warning(`${data.platform} 超时未完成，稍后可在历史中查看`);
            }
          }
        }
      } catch {
        const ref = pollingRefs.current[recordId];
        if (ref) {
          ref.attempts += 1;
          if (ref.attempts >= 120) {
            clearInterval(ref.timerId);
            delete pollingRefs.current[recordId];
            setRemainingTasks(prev => Math.max(0, prev - 1));
            message.error(`记录 ${recordId} 轮询失败/超时`);
          }
        }
      }
    };
    const timerId = setInterval(check, 30000);
    pollingRefs.current[recordId].timerId = timerId;
    check();
  };

  const handleSubmit = async (values) => {
    setLoading(true);
    try {
      const validPlatforms = ['doubao', 'deepseek', 'kimi', 'qianwen'];
      const platforms = Array.isArray(values.platforms)
        ? Array.from(new Set(values.platforms)).filter(p => validPlatforms.includes(p))
        : [];
      if (platforms.length === 0) {
        message.error('请选择至少一个平台');
        setLoading(false);
        return;
      }

      const inputKeywords = Array.isArray(values.highlightKeywords) ? values.highlightKeywords : [];
      const hl = Array.from(new Set(inputKeywords.map(k => String(k || '').trim()).filter(Boolean)));
      setHighlightKeywords(hl);

      const questionsText = String(values.questions || '').trim();
      let questions = questionsText
        ? questionsText.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
        : [];
      if (questions.length === 0 && values.question) {
        questions = [String(values.question).trim()];
      }
      const uniqueQuestions = Array.from(new Set(questions));

      const sseCapable = ['deepseek', 'doubao'];
      const ssePlatforms = platforms.filter(p => sseCapable.includes(p));
      const nonSsePlatforms = platforms.filter(p => !sseCapable.includes(p));
      let startedStreaming = false;

      setResults([]);

      if (ssePlatforms.length > 0 && uniqueQuestions.length > 0) {
        uniqueQuestions.forEach(q => {
          ssePlatforms.forEach(plat => {
            handleStreamConnection(plat, q, hl);
          });
        });
        startedStreaming = true;
      }

      let createdTotal = 0;
      if (nonSsePlatforms.length > 0 && uniqueQuestions.length > 0) {
        for (const q of uniqueQuestions) {
          const payload = {
            user_id: userId,
            question: q,
            highlight_keywords: hl,
            platforms: nonSsePlatforms
          };
          const res = await axios.post('/api/detection/create', payload, {
            headers: token ? { Authorization: `Bearer ${token}` } : {}
          });
          const ids = (res?.data?.data?.record_ids || res?.data?.data?.results?.map(item => item.record_id) || [])
            .filter(Boolean);
          ids.forEach(id => startPollingRecord(id));
          createdTotal += ids.length;
        }
      }

      setRemainingTasks(createdTotal);
      if (createdTotal === 0 && !startedStreaming) {
        message.warning('未创建任何任务，请检查平台选择或问题输入');
      }
    } catch {
      message.error('检测失败，请稍后重试');
    }
    // 修复 setTimeout 闭包问题：使用函数式更新获取最新状态
    setTimeout(() => {
      setRemainingTasks(prev => {
        setLoading(prev > 0);
        return prev;
      });
    }, 0);
  };

  useEffect(() => {
    return () => {
      Object.values(pollingRefs.current).forEach(({ timerId }) => clearInterval(timerId));
      pollingRefs.current = {};
      Object.values(sseRefs.current).forEach(es => { if (es && typeof es.close === 'function') es.close(); });
      sseRefs.current = {};
    };
  }, [token, userId]);

  return (
    <>
      <Content style={{ padding: '24px' }}>
        <div className="page-container">
          <Spin spinning={loading} tip="正在检测中，请稍候..." size="large">
            <Row gutter={[24, 24]}>
              <Col span={24}>
                <DetectionForm
                  loading={loading}
                  onSubmit={handleSubmit}
                />
              </Col>
              <Col span={24}>
                <ResultsDisplay results={results} highlightKeywords={highlightKeywords} loading={loading} />
              </Col>
            </Row>
          </Spin>
        </div>
      </Content>
      <Footer />
    </>
  );
}

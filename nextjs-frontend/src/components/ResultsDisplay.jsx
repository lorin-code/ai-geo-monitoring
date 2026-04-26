'use client';

import React from 'react';
import { Card, Tag, Space } from 'antd';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkKeywordHighlight from '@/utils/remarkKeywordHighlight';
import { FileTextOutlined } from '@ant-design/icons';

const PLATFORM_OPTIONS = [
  { value: 'doubao', label: '豆包' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'kimi', label: 'Kimi' },
  { value: 'qianwen', label: '千问' }
];

const ResultsDisplay = ({ results, highlightKeywords = [], loading = false }) => {
  const countKeywordOccurrences = (text, keywords, englishWordBoundary = true) => {
    const s = typeof text === 'string' ? text : String(text || '');
    const list = Array.isArray(keywords) ? keywords.filter(Boolean) : [];
    const escape = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return list.map((kw) => {
      const e = escape(String(kw));
      const useBoundary = englishWordBoundary && /^[A-Za-z]+$/.test(String(kw));
      const re = new RegExp(useBoundary ? `\\b${e}\\b` : e, 'gi');
      const c = [...s.matchAll(re)].length;
      return { keyword: String(kw), count: c };
    }).filter(item => item.count > 0);
  };

  return (
    <Card
      title={<span><FileTextOutlined style={{ marginRight: 8, color: '#1f4dd2' }} />检测结果</span>}
      style={{ marginBottom: 24 }}
      size="default"
    >
      {Array.isArray(results) && results.length > 0 ? (
        results.map((record) => {
          const stats = countKeywordOccurrences(record.originalText, highlightKeywords, true);
          const platformLabel = PLATFORM_OPTIONS.find(p => p.value === record.platform)?.label || record.platform;
          return (
            <Card
              key={`${record.platform}-${record.question}`}
              style={{ marginBottom: 16 }}
              size="small"
              variant="outlined"
            >
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                <Tag color="blue" style={{ marginRight: 8 }}>{platformLabel}</Tag>
                {record.question ? (
                  <span style={{ color: '#555' }}>{record.question}</span>
                ) : null}
              </div>

              <div style={{ marginBottom: 8 }}>
                <span style={{ color: '#888', marginRight: 8 }}>关键词统计：</span>
                {stats.length > 0 ? (
                  <Space wrap>
                    {stats.map(s => (
                      <Tag key={s.keyword} color="gold">{`${s.keyword} × ${s.count}`}</Tag>
                    ))}
                  </Space>
                ) : (
                  <span style={{ color: '#999' }}>无</span>
                )}
              </div>

              <div style={{ lineHeight: 1.7 }}>
                {record.originalText ? (
                  <ReactMarkdown
                    remarkPlugins={[
                      remarkGfm,
                      [remarkKeywordHighlight, { keywords: highlightKeywords, englishWordBoundary: true }]
                    ]}
                    components={{
                      em: ({ children }) => (
                        <mark style={{ backgroundColor: '#fff3a1' }}>{children}</mark>
                      )
                    }}
                  >
                    {String(record.originalText)}
                  </ReactMarkdown>
                ) : (
                  <span style={{ color: '#999' }}>
                    {loading ? '正在生成中...' : '无内容'}
                  </span>
                )}
              </div>
            </Card>
          );
        })
      ) : (
        <div style={{ color: '#999' }}>暂无检测结果</div>
      )}
    </Card>
  );
};

export default ResultsDisplay;

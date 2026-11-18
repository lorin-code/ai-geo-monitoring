// @ts-nocheck
'use client';

import React from 'react';
import { Layout, Typography, Collapse, Space, Button } from 'antd';
import { ThunderboltOutlined } from '@ant-design/icons';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { clearAuth } from '@/lib/axiosConfig';
import { MONITORING_PLATFORM_OPTIONS, MONITORING_PLATFORM_NAMES } from '@/utils/monitoringPlatforms.cjs';

const { Content } = Layout;
const { Title, Paragraph } = Typography;

// 图片路径
const bannerImg = '/assets/banner.svg';

export default function HomePage() {
  const router = useRouter();

  const handleLogout = () => {
    clearAuth();
    router.push('/');
  };

  // 平台 logos
  const platformLogos = MONITORING_PLATFORM_OPTIONS.map((platform) => ({
    src: `/assets/platforms/${platform.value}.svg`,
    name: platform.label,
  }));

  return (
    <Layout className="layout">
      <Header onLogout={handleLogout} isGeoRoute={false} />
      <Content style={{ padding: 0, marginTop: 64 }}>
        {/* Goodie 风格：英雄区（深色，中文） */}
        <div className="landing-hero">
          <div className="page-container hero-inner">
            <Title level={1} className="hero-title">
              成为 AI 的{' '}
              <span className="flip-words" aria-label="来源、引用、回答">
                <span className="flip-words-inner">
                  <span>来源</span>
                  <span>引用</span>
                  <span>回答</span>
                </span>
              </span>
            </Title>
            <div className="platform-strip">
              {platformLogos.map((platform, idx) => (
                platform.src ? (
                  <Image key={idx} className="platform-logo" src={platform.src} alt={platform.name} width={42} height={42} />
                ) : (
                  <span key={idx} className="platform-chip">{platform.name}</span>
                )
              ))}
            </div>
            <Paragraph className="hero-desc" style={{ marginBottom: 24 }}>
              深度洞察品牌在人工智能推荐系统中的表现，释放 AI 搜索流量增长潜力，掌控大模型如何谈论你；在 {MONITORING_PLATFORM_NAMES} 中追踪品牌提及与可见性。
            </Paragraph>
            <Space size="middle" className="hero-actions">
              <Button type="primary" size="large" className="pill-btn" icon={<ThunderboltOutlined />} onClick={() => router.push('/geo')}>
                开始 GEO 检查
              </Button>
              <Button
                size="large"
                className="pill-btn"
                ghost
                onClick={() => document.getElementById('future')?.scrollIntoView({ behavior: 'smooth' })}
              >
                了解更多
              </Button>
            </Space>
            <div className="hero-media">
              <Image src={bannerImg} alt="Banner" className="hero-img" width={960} height={540} priority />
            </div>
          </div>
        </div>

        {/* 自然增长的新前沿：左右分栏布局 */}
        <div id="future" className="page-container section-container">
          <div className="section-split">
            <div className="split-left">
              <div className="section-eyebrow eyebrow-pill">搜索的未来</div>
              <Title level={2} className="section-title">AI 时代自然搜索的新领域</Title>
            </div>
            <div className="split-right">
              <Paragraph className="section-subtitle section-lead">
                LLM 可见性是品牌争相抢占的新型数字货架。每天有数十亿人使用 AI 问答引擎来塑造观点、辅助购买决策并解答有关您的品牌和行业的问题，埃森哲最新研究显示72% 的消费者已频繁使用生成式 AI 辅助决策，
              </Paragraph>
            </div>
          </div>
        </div>

        {/* 核心模块 */}
        <div className="page-container section-container">
          <div className="grid-3">
            <div className="card-plain">
              <Title level={4} className="section-title">竞品分析</Title>
              <Paragraph className="section-subtitle">比较头部竞品的可见度、引用位置与回答质量，发现差距与机会。</Paragraph>
            </div>
            <div className="card-plain">
              <Title level={4} className="section-title">数据仪表</Title>
              <Paragraph className="section-subtitle">实时监测品牌存在度、趋势变化与关键提示词，按引擎聚合展示。</Paragraph>
            </div>
            <div className="card-plain">
              <Title level={4} className="section-title">多平台分析</Title>
              <Paragraph className="section-subtitle">多个平台快速分析，以准确了解您的品牌在不同AI平台中的表现。</Paragraph>
            </div>
          </div>
        </div>

        {/* 常见问题 */}
        <div className="page-container section-container">
          <Title level={3} className="section-title" style={{ marginBottom: 16 }}>常见问题</Title>
          <Collapse
            className="faq"
            ghost
            items={[
              {
                key: '1',
                label: '什么是 GEO？',
                children: (
                  <Paragraph className="section-subtitle">
                    生成引擎优化（Generative Engine Optimization, GEO）‌，是AI搜索优化的多元拓展，聚焦于生成式AI环境下的内容整合与结构化数据应用。其目标是让AI快速提取内容中的关键信息，并在生成答案时优先引用品牌内容。
                  </Paragraph>
                )
              },
              {
                key: '2',
                label: '为什么GEO对品牌至关重要？',
                children: (
                  <Paragraph className="section-subtitle">
                    埃森哲最新研究显示，72% 的消费者已频繁使用生成式AI辅助决策，品牌在AI眼中的形象正直接影响业务增长。
                  </Paragraph>
                )
              },
              {
                key: '3',
                label: '支持哪些AI平台？',
                children: (
                  <Paragraph className="section-subtitle">
                    当前监测平台：{MONITORING_PLATFORM_NAMES}。
                  </Paragraph>
                )
              },
              {
                key: '4',
                label: '数据从哪里来？',
                children: (
                  <Paragraph className="section-subtitle">
                    系统通过调用各平台官方API获取AI回答原文，并在本地进行轻量解析与统计，不爬取网页、不采集个人隐私信息。
                  </Paragraph>
                )
              },
              {
                key: '6',
                label: '如何开始使用？',
                children: (
                  <Paragraph className="section-subtitle">
                    登录后在 GEO 页面选择平台、输入问题与关键词，点击开始检测即可实时获取结果。历史记录与数据导出在左侧菜单中提供。
                  </Paragraph>
                )
              },
              {
                key: '7',
                label: '配额与会员说明',
                children: (
                  <Paragraph className="section-subtitle">
                    不同会员等级拥有每日检测次数与导出配额差异。超出配额将提示受限，可在个人中心或管理员后台调整与升级。
                  </Paragraph>
                )
              },
            ]}
          />
        </div>

        {/* 底部 CTA */}
        <div className="page-container section-container">
          <div style={{ textAlign: 'center' }}>
            <Title level={3} className="section-title" style={{ marginBottom: 12 }}>
              准备好释放 AI 搜索增长了吗？
            </Title>
            <Paragraph className="section-subtitle" style={{ marginBottom: 16 }}>
              从监测开始，以迭代赢得答案引擎，成为 AI 的标准答案。
            </Paragraph>
            <Button type="primary" size="large" className="pill-btn" icon={<ThunderboltOutlined />} onClick={() => router.push('/geo')}>
              开始 GEO 检查
            </Button>
          </div>
        </div>
      </Content>
      <Footer />
    </Layout>
  );
}

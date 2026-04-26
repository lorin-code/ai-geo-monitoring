'use client';

import React from 'react';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import '@/lib/axiosConfig'; // 初始化axios全局配置

export default function AntdRegistry({ children }) {
  return (
    <ConfigProvider locale={zhCN}>
      {children}
    </ConfigProvider>
  );
}

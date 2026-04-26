'use client';

import React from 'react';
import { Layout } from 'antd';

const { Footer: AntFooter } = Layout;

export default function Footer() {
  return (
    <AntFooter style={{ textAlign: 'center' }}>
      GEO检测工具 ©2025 Created by Goodie AI
    </AntFooter>
  );
}

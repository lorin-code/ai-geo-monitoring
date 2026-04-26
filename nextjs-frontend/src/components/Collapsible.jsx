'use client';

import React, { useState } from 'react';
import { Button } from 'antd';
import { DownOutlined } from '@ant-design/icons';

export default function Collapsible({
  title,
  defaultCollapsed = false,
  extra,
  children,
  className,
  style,
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div className={className} style={{ border: '1px solid #f0f0f0', borderRadius: 8, marginBottom: 12, ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px' }}>
        <Button
          type="text"
          onClick={() => setCollapsed(!collapsed)}
          icon={<DownOutlined style={{ transition: 'transform 0.2s', transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }} />}
        >
          {title}
        </Button>
        {extra}
      </div>
      <div style={{ display: collapsed ? 'none' : 'block', padding: '0 12px 12px 12px' }}>
        {children}
      </div>
    </div>
  );
}

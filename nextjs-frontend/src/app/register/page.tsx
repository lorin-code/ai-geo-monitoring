// @ts-nocheck
'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import Register from '@/components/Register';

export default function RegisterPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [currentUser, setCurrentUser] = useState(null);

  // 从 localStorage 读取用户信息
  useEffect(() => {
    const storedToken = localStorage.getItem('agd_token') || '';
    const storedUser = localStorage.getItem('agd_user');
    setToken(storedToken);
    if (storedUser) {
      try {
        setCurrentUser(JSON.parse(storedUser));
      } catch {
        setCurrentUser(null);
      }
    }

  }, []);

  const handleLogin = ({ token: tk, user }) => {
    setToken(tk);
    setCurrentUser(user);
    localStorage.setItem('agd_token', tk);
    localStorage.setItem('agd_user', JSON.stringify(user || null));
    if (user?.id) localStorage.setItem('agd_user_id', String(user.id));
    router.push('/geo');
  };

  return <Register onLogin={handleLogin} />;
}

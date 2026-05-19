import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  async rewrites() {
    const API_BASE_URL =
      process.env.API_BASE_URL ||
      (process.env.NODE_ENV === 'production' ? undefined : 'http://localhost:3002');

    if (!API_BASE_URL) {
      return [];
    }

    return [
      {
        source: '/api/:path*',
        destination: `${API_BASE_URL}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;

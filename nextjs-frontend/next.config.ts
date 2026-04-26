import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, "../"),
  async rewrites() {
    const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3002';
    return [
      {
        source: '/api/:path*',
        destination: `${API_BASE_URL}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;

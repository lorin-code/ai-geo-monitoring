import type { NextConfig } from "next";
import path from "node:path";
import { getApiRewrites } from './config/api.cjs';

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  async rewrites() {
    return getApiRewrites();
  },
};

export default nextConfig;

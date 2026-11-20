import type { NextConfig } from 'next';
const config: NextConfig = {
  serverExternalPackages: ['@sparticuz/chromium', 'puppeteer-core', 'sharp'],
  experimental: { cpus: 1 },
};
export default config;

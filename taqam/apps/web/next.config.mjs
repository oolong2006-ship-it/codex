/** @type {import('next').NextConfig} */
const isDemo = process.env.NEXT_PUBLIC_DEMO === '1';
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/+$/, '');

const nextConfig = isDemo
  ? {
      // Static demo (GitHub Pages): no server, the API is mocked in the browser (src/demo).
      reactStrictMode: true,
      output: 'export',
      basePath: basePath || undefined,
      assetPrefix: basePath || undefined,
      trailingSlash: true,
      images: { unoptimized: true },
      transpilePackages: ['@taqam/core'],
    }
  : {
      reactStrictMode: true,
      output: 'standalone',
      transpilePackages: ['@taqam/core'],
    };
export default nextConfig;

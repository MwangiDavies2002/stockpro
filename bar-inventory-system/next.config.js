const withPWA = require('@ducanh2912/next-pwa').default({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  workboxOptions: {
    skipWaiting: true,
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(process.env.STOCKPRO_DESKTOP_BUILD==='1' ? {output:'export',trailingSlash:true,distDir:'.next-desktop'} : {}),
  reactStrictMode: true,
  devIndicators: false,
  async rewrites() {
    if(process.env.STOCKPRO_DESKTOP_BUILD==='1')return [];
    return [
      {source:'/treasury/:id/book',destination:'/treasury/book?id=:id'},
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5050'}/api/:path*`,
      },
    ];
  },
  images: {
    unoptimized: process.env.STOCKPRO_DESKTOP_BUILD==='1',
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'https', hostname: '**' },
    ],
  },
};

if(process.env.STOCKPRO_DESKTOP_BUILD==='1')delete nextConfig.rewrites;
module.exports = nextConfig;

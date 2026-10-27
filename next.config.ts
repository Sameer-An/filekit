import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Packages that should be treated as server-only (not bundled into the client bundle).
  serverExternalPackages: ['sharp', 'fluent-ffmpeg', 'archiver', 'pdf-lib'],

  // Empty turbopack config – silences the "webpack config without turbopack config" warning
  // in Next.js 16 where Turbopack is the default bundler.
  turbopack: {},

  // Security headers applied to all routes.
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;

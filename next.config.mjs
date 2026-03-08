import withPWAInit from 'next-pwa';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Allow images from Vercel Blob
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.public.blob.vercel-storage.com',
      },
    ],
  },
};

const withPWA = withPWAInit({
  dest: 'public',
  cacheOnFrontEndNav: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === 'development',
  // Extended PWA configuration
  runtimeCaching: [
    {
      // Cache Vercel Blob images for offline viewing
      urlPattern: /^https:\/\/.*\.public\.blob\.vercel-storage\.com\/.*/i,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'vercel-blob-images',
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
        },
      },
    },
  ],
});

export default withPWA(nextConfig);

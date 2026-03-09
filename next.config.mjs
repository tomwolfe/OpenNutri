import withPWAInit from 'next-pwa';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  },
  // Allow images from Vercel Blob
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.public.blob.vercel-storage.com',
      },
    ],
  },
  webpack: (config, { isServer }) => {
    // If we're building for the client (browser), ignore node-specific modules
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        child_process: false,
        crypto: false,
      };

      // Client-side: exclude problematic WASM bundles from terser minification
      // These files contain ES module syntax that terser cannot handle
      config.optimization = {
        ...config.optimization,
        minimizer: [
          ...(config.optimization?.minimizer || []),
          (compiler) => {
            const TerserPlugin = compiler.webpack.TerserPlugin;
            if (TerserPlugin) {
              new TerserPlugin({
                exclude: [
                  /onnxruntime/,
                  /ort-wasm/,
                  /transformers/,
                  /\.wasm$/,
                ],
              }).apply(compiler);
            }
          },
        ],
      };

      // Exclude WASM and problematic ML bundles from client build
      config.module = {
        ...config.module,
        rules: [
          ...(config.module?.rules || []),
          {
            test: /\.wasm$/,
            type: 'asset/resource',
          },
          // Exclude onnxruntime WASM bundles from being processed by babel/swc
          {
            test: /onnxruntime.*\.m?js$/,
            loader: 'null-loader',
          },
        ],
      };
    } else {
      // Server-side: exclude native modules and heavy ML libraries
      // These are platform-specific and not needed for serverless builds
      config.externals = [
        ...(config.externals || []),
        'onnxruntime-node',
        'onnxruntime-web',
        '@huggingface/transformers',
        '@node-rs/argon2',
      ];

      // Exclude binary files from being processed
      config.module = {
        ...config.module,
        noParse: [/\.node$/, /\.wasm$/],
      };

      // Ignore binary files and problematic bundles
      config.module = {
        ...config.module,
        rules: [
          ...(config.module?.rules || []),
          {
            test: /\.wasm$/,
            use: 'null-loader',
          },
          // Exclude onnxruntime bundles from server build
          {
            test: /onnxruntime.*\.m?js$/,
            use: 'null-loader',
          },
          // Exclude worker files that import heavy ML libraries
          {
            test: /ai\.worker\.ts$/,
            use: 'null-loader',
          },
        ],
      };
    }

    return config;
  },
};

// Disable PWA for now due to bundling issues with onnxruntime
// const withPWA = withPWAInit({
//   dest: 'public',
//   cacheOnFrontEndNav: true,
//   reloadOnOnline: true,
//   disable: process.env.NODE_ENV === 'development',
//   runtimeCaching: [],
// });

export default nextConfig;

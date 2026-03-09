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
  // Task 1.5: Experimental features for better ML model handling
  experimental: {
    // Optimize server components
    optimizePackageImports: ['@huggingface/transformers', 'onnxruntime-web'],
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

      // Task 1.5: Client-side optimization - exclude problematic WASM bundles from terser minification
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
                // Use esbuild for faster minification
                terserOptions: {
                  compress: {
                    passes: 2,
                    keep_fargs: false,
                    keep_classnames: true,
                    keep_fnames: true, // Keep function names for debugging
                  },
                  mangle: {
                    keep_classnames: true,
                    keep_fnames: true, // Keep class names for ML models
                  },
                  format: {
                    comments: false,
                  },
                },
              }).apply(compiler);
            }
          },
        ],
        // Task 1.5: Split chunks for better caching
        splitChunks: {
          chunks: 'all',
          cacheGroups: {
            // Separate ML models into their own chunk
            ml: {
              name: 'ml-models',
              test: /[\\/]node_modules[\\/](@huggingface|onnxruntime|transformers)[\\/]/,
              priority: 10,
              reuseExistingChunk: true,
            },
            // Separate workers
            workers: {
              name: 'workers',
              test: /[\\/]workers[\\/]/,
              priority: 20,
              reuseExistingChunk: true,
            },
            // Common vendor libraries
            vendors: {
              name: 'vendors',
              test: /[\\/]node_modules[\\/]/,
              priority: -10,
              reuseExistingChunk: true,
            },
          },
        },
      };

      // Task 1.5: Better WASM and ML model handling
      config.module = {
        ...config.module,
        rules: [
          ...(config.module?.rules || []),
          {
            test: /\.wasm$/,
            type: 'asset/resource',
            generator: {
              filename: 'static/chunks/[hash].base64[ext]',
            },
          },
          // Exclude onnxruntime WASM bundles from being processed by babel/swc
          {
            test: /onnxruntime.*\.m?js$/,
            loader: 'null-loader',
          },
          // Handle ML model files with lazy loading
          {
            test: /.*transformers.*\.(js|mjs)$/,
            type: 'javascript/auto',
            resolve: {
              fullySpecified: false,
            },
          },
        ],
        // Exclude heavy ML libraries from parsing
        noParse: [
          /onnxruntime-web/,
          /transformers\.js/,
          /\.wasm$/,
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

// Task 5.2: Enable PWA with robust offline support
const withPWA = withPWAInit({
  dest: 'public',
  cacheOnFrontEndNav: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === 'development',
  // Register service worker
  register: true,
  // Scope for service worker
  scope: '/',
  // Sw location
  sw: 'service-worker.js',
  // Runtime caching strategies
  runtimeCaching: [
    {
      // Cache static assets (JS, CSS, images)
      urlPattern: /^https:\/\/.*\.(js|css|png|jpg|jpeg|gif|svg|webp|wasm)$/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'opennutri-static-assets',
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
        },
      },
    },
    {
      // Cache API responses with network-first strategy
      urlPattern: /^https:\/\/.*\/api\/.*$/i,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'opennutri-api-cache',
        networkTimeoutSeconds: 10,
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 24 * 60 * 60, // 24 hours
        },
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    },
    {
      // Cache USDA API responses
      urlPattern: /^https:\/\/api\.nal\.usda\.gov\/.*$/i,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'opennutri-usda-cache',
        expiration: {
          maxEntries: 500,
          maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
        },
      },
    },
    {
      // Cache Hugging Face model files (Transformers.js)
      urlPattern: /^https:\/\/.*\.hf\.co\/.*$/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'opennutri-ml-models',
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
        },
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    },
    {
      // Cache CDN assets (Transformers.js, ONNX)
      urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/.*$/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'opennutri-cdn-assets',
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
        },
      },
    },
  ],
});

export default withPWA(nextConfig);

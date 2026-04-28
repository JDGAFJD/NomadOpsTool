import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Exclude native modules that only work in local dev (not on Vercel serverless)
  serverExternalPackages: ['better-sqlite3'],

  webpack: (config, { isServer }) => {
    if (isServer) {
      // Prevent webpack from trying to bundle native add-ons
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : []),
        'better-sqlite3',
      ];
    }
    return config;
  },
};

export default nextConfig;

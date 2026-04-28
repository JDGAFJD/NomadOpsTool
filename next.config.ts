import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Exclude native modules that only work in local dev (not on Vercel serverless).
  // better-sqlite3 is a compiled native addon — excluded here so Turbopack/Vercel
  // doesn't try to bundle it. On Vercel, getSetting() uses process.env exclusively.
  serverExternalPackages: ['better-sqlite3'],

  // Empty turbopack config silences the "webpack config present" warning in Next.js 16
  turbopack: {},
};

export default nextConfig;

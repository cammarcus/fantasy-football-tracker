import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // In `next dev`, forward API calls to the local FastAPI server. On Vercel (and in `vercel dev`)
  // the top-level rewrites in vercel.json send /api/* to the backend service before Next sees it.
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];
    const target = process.env.API_PROXY_TARGET ?? "http://127.0.0.1:8000";
    return [{ source: "/api/:path*", destination: `${target}/api/:path*` }];
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

import path from "node:path";
import type { NextConfig } from "next";

// The only bootstrap value a frontend needs: where the API lives (server side).
const api = process.env.NETFLY_API_URL ?? "http://localhost:8000";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The dev-tools badge floats bottom-left, over the phone tab bar (and e2e taps on it).
  devIndicators: false,
  output: "standalone",
  // Set per deploy: static URLs get ?dpl=<id>, so CDN/browser caches (incl. cached 404s) never
  // serve a previous deploy's response for an asset whose content hash didn't change.
  deploymentId: process.env.NETFLY_DEPLOYMENT_ID || undefined,
  // Trace from the monorepo root so workspace packages land in the standalone bundle.
  outputFileTracingRoot: path.join(__dirname, "../../"),
  transpilePackages: ["@netfly/ui", "@netfly/api-client"],
  images: { loader: "custom", loaderFile: "./src/lib/image-loader.ts" },
  experimental: { optimizePackageImports: ["lucide-react", "framer-motion"] },
  async headers() {
    // HSTS only in production builds (served over HTTPS behind the edge proxy).
    if (process.env.NODE_ENV !== "production") return [];
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
  // Low-disk hosts: skip the on-disk webpack cache (it can exceed the build itself).
  webpack: (config) => {
    if (process.env.NETFLY_BUILD_NO_CACHE === "1") config.cache = false;
    return config;
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${api}/api/:path*` }];
  },
};

export default config;

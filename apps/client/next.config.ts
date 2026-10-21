import path from "node:path";
import type { NextConfig } from "next";

// The only bootstrap value a frontend needs: where the API lives (server side).
const api = process.env.NETFLY_API_URL ?? "http://localhost:8000";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: "standalone",
  // Trace from the monorepo root so workspace packages land in the standalone bundle.
  outputFileTracingRoot: path.join(__dirname, "../../"),
  transpilePackages: ["@netfly/ui", "@netfly/api-client"],
  images: { loader: "custom", loaderFile: "./src/lib/image-loader.ts" },
  experimental: { optimizePackageImports: ["lucide-react", "framer-motion"] },
  async headers() {
    // Brand files are versioned by name (…v1.mp4): cache them for a year.
    const brand = {
      source: "/brand/:path*",
      headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
    };
    // HSTS only in production builds (served over HTTPS behind the edge proxy).
    if (process.env.NODE_ENV !== "production") return [brand];
    return [
      brand,
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
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${api}/api/:path*` }];
  },
};

export default config;

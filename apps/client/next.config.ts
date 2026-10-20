import type { NextConfig } from "next";

// The only bootstrap value a frontend needs: where the API lives (server side).
const api = process.env.NETFLY_API_URL ?? "http://localhost:8000";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: "standalone",
  transpilePackages: ["@netfly/ui", "@netfly/api-client"],
  images: { loader: "custom", loaderFile: "./src/lib/image-loader.ts" },
  experimental: { optimizePackageImports: ["lucide-react", "framer-motion"] },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${api}/api/:path*` }];
  },
};

export default config;

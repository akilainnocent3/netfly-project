"use client";

import type { PublicConfig } from "@netfly/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "framer-motion";
import { useState } from "react";
import { AuthProvider } from "./auth";
import { ConfigProvider } from "./config";
import { ToastProvider } from "../ui/toast";

export function Providers({ config, children }: { config: PublicConfig; children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, gcTime: 10 * 60_000, refetchOnWindowFocus: false, retry: 1 },
        },
      }),
  );
  return (
    <ConfigProvider value={config}>
      <QueryClientProvider client={queryClient}>
        <MotionConfig reducedMotion="user" transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}>
          <ToastProvider>
            <AuthProvider>{children}</AuthProvider>
          </ToastProvider>
        </MotionConfig>
      </QueryClientProvider>
    </ConfigProvider>
  );
}

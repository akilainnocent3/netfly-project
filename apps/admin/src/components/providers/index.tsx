"use client";

import type { PublicConfig } from "@netfly/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "framer-motion";
import { useState } from "react";
import { AuthProvider } from "./auth";
import { ConfigProvider } from "./config";
import { ThemeProvider } from "./theme";
import { ToastProvider } from "./toast";

export function Providers({ config, children }: { config: PublicConfig; children: React.ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: false, retry: 1 } } }),
  );
  return (
    <ConfigProvider value={config}>
      <ThemeProvider>
        <QueryClientProvider client={client}>
          <MotionConfig reducedMotion="user">
            <ToastProvider>
              <AuthProvider>{children}</AuthProvider>
            </ToastProvider>
          </MotionConfig>
        </QueryClientProvider>
      </ThemeProvider>
    </ConfigProvider>
  );
}

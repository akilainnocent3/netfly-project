"use client";

import type { PublicConfig } from "@netfly/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LazyMotion, MotionConfig } from "framer-motion";
import { useState } from "react";
import { AuthProvider } from "./auth";
import { ConfigProvider } from "./config";
import { ProfileProvider } from "./profile";
import { OfflineBanner } from "../ui/offline-banner";
import { ToastProvider } from "../ui/toast";

const loadMotionFeatures = () => import("./motion-features").then((mod) => mod.default);

export function Providers({
  config,
  children,
}: {
  config: PublicConfig;
  children: React.ReactNode;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 10 * 60_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );
  return (
    <ConfigProvider value={config}>
      <QueryClientProvider client={queryClient}>
        <LazyMotion features={loadMotionFeatures} strict>
          <MotionConfig
            reducedMotion="user"
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            <ToastProvider>
              <OfflineBanner />
              <AuthProvider>
                <ProfileProvider>{children}</ProfileProvider>
              </AuthProvider>
            </ToastProvider>
          </MotionConfig>
        </LazyMotion>
      </QueryClientProvider>
    </ConfigProvider>
  );
}

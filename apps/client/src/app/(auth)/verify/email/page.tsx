"use client";

import { Suspense } from "react";
import { ChannelStep } from "@/components/verify/channel-step";

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <ChannelStep channel="email" />
    </Suspense>
  );
}

"use client";

import { Suspense } from "react";
import { ChannelStep } from "@/components/verify/channel-step";

export default function VerifyPhonePage() {
  return (
    <Suspense>
      <ChannelStep channel="phone" />
    </Suspense>
  );
}

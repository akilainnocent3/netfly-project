import type { Metadata } from "next";
import { Suspense } from "react";
import { SignupDraftProvider } from "./draft";

export const metadata: Metadata = { title: "Create your account" };

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <SignupDraftProvider>{children}</SignupDraftProvider>
    </Suspense>
  );
}

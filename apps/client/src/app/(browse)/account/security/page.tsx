"use client";

import { AccountPanel } from "@/components/account/account-nav";
import { PasswordForm } from "@/components/account/settings";

export default function SecurityPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <AccountPanel title="Password" description="Changing it signs you out on every other device.">
        <PasswordForm />
      </AccountPanel>
    </div>
  );
}

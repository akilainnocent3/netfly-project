"use client";

import { AccountPanel } from "@/components/account/account-nav";
import { MembershipCard } from "@/components/account/membership-card";

export default function MembershipPage() {
  return (
    <div className="space-y-6">
      <MembershipCard detailed />
      <AccountPanel
        title="Payment history"
        description="Mobile money payments for your membership."
        testId="payment-history"
      >
        <p className="text-body text-[#b3b3b3]">No payments yet.</p>
      </AccountPanel>
    </div>
  );
}

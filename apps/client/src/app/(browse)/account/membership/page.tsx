"use client";

import { MembershipCard } from "@/components/account/membership-card";
import { PaymentHistory } from "@/components/account/payment-history";

export default function MembershipPage() {
  return (
    <div className="space-y-6">
      <MembershipCard detailed />
      <PaymentHistory />
    </div>
  );
}

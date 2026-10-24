"use client";

import { CreditCard, Gauge, KeyRound, MonitorPlay } from "lucide-react";
import { AccountLinkRow, AccountPanel } from "@/components/account/account-nav";
import { MembershipCard } from "@/components/account/membership-card";
import { NameSetting } from "@/components/account/settings";
import { UsageCard } from "@/components/account/usage-card";
import { useAuth } from "@/components/providers/auth";
import { Skeleton } from "@/components/ui/skeleton";

export default function AccountOverviewPage() {
  const { user } = useAuth();
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <div className="space-y-6">
        <MembershipCard />
        <UsageCard compact />
      </div>
      <div className="space-y-6">
        <AccountPanel title="Quick links">
          <AccountLinkRow
            href="/signup/plan?from=account"
            icon={<CreditCard />}
            label="Change plan"
            hint="Same top quality on every plan — choose how much you watch"
          />
          <AccountLinkRow
            href="/account/usage"
            icon={<Gauge />}
            label="Viewing time"
            hint="Today, this week and this month"
          />
          <AccountLinkRow href="/account/security" icon={<KeyRound />} label="Update password" />
          <AccountLinkRow
            href="/account/playback"
            icon={<MonitorPlay />}
            label="Playback settings"
            hint="Autoplay, subtitles and quality"
          />
        </AccountPanel>
        <AccountPanel title="Profile" description={user ? `@${user.username}` : undefined}>
          {user ? <NameSetting user={user} /> : <Skeleton className="h-14 rounded" />}
        </AccountPanel>
      </div>
    </div>
  );
}

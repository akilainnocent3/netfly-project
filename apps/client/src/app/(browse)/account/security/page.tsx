"use client";

import { CircleAlert, CircleCheck, Mail, Smartphone } from "lucide-react";
import Link from "next/link";
import { AccountPanel } from "@/components/account/account-nav";
import { PasswordForm } from "@/components/account/settings";
import { useAuth } from "@/components/providers/auth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { maskPhone, NETWORKS, networkOf } from "@/lib/phone";

function ContactRow({
  icon,
  label,
  value,
  verified,
  extra,
  href,
  testId,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null | undefined;
  verified: boolean;
  extra?: string;
  href: string;
  testId: string;
}) {
  return (
    <div
      data-testid={testId}
      className="flex flex-wrap items-center gap-4 border-b border-white/8 py-4 last:border-b-0"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white/8 [&_svg]:size-5">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-meta text-[#b3b3b3]">{label}</p>
        <p className="text-body truncate font-semibold">
          {value || "Not added"}
          {extra ? <span className="font-normal text-[#b3b3b3]"> · {extra}</span> : null}
        </p>
        {value ? (
          <p
            className={`text-meta mt-0.5 flex items-center gap-1.5 ${verified ? "text-[#46d369]" : "text-[#ffb35c]"}`}
          >
            {verified ? (
              <CircleCheck className="size-3.5" aria-hidden />
            ) : (
              <CircleAlert className="size-3.5" aria-hidden />
            )}
            {verified ? "Verified" : "Not verified"}
          </p>
        ) : null}
      </div>
      <Button asChild variant="secondary" size="sm" className="rounded">
        <Link href={href}>{!value ? "Add" : verified ? "Change" : "Verify"}</Link>
      </Button>
    </div>
  );
}

export default function SecurityPage() {
  const { user } = useAuth();
  const network = networkOf(user?.phone);
  return (
    <div className="max-w-2xl space-y-6">
      <AccountPanel
        title="Email & phone"
        description="Needed only for paid plans and free trials — and handy for resetting your password."
      >
        {user ? (
          <>
            <ContactRow
              testId="contact-email"
              icon={<Mail />}
              label="Email"
              value={user.email}
              verified={user.email_verified}
              href="/verify/email?from=account"
            />
            <ContactRow
              testId="contact-phone"
              icon={<Smartphone />}
              label="Mobile number"
              value={user.phone ? maskPhone(user.phone) : null}
              verified={user.phone_verified}
              extra={network ? NETWORKS[network].label : undefined}
              href="/verify/phone?from=account"
            />
          </>
        ) : (
          <Skeleton className="h-32 rounded" />
        )}
      </AccountPanel>
      <AccountPanel title="Password" description="Changing it signs you out on every other device.">
        <PasswordForm />
      </AccountPanel>
    </div>
  );
}

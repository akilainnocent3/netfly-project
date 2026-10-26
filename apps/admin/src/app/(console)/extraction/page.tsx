"use client";

import { cn } from "@netfly/ui";
import * as Tabs from "@radix-ui/react-tabs";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ApprovedEmbeds } from "@/components/extraction/approved-embeds";
import { JobsList } from "@/components/extraction/jobs-list";
import { StartForm } from "@/components/extraction/start-form";
import { PageHeader } from "@/components/ui/primitives";
import { RoleGate } from "@/components/extraction/role-gate";

type Tab = "check" | "approved";

export default function ExtractionPage() {
  return (
    <RoleGate>
      <Suspense>
        <ExtractionTabs />
      </Suspense>
    </RoleGate>
  );
}

function ExtractionTabs() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab: Tab = params.get("tab") === "approved" ? "approved" : "check";
  const setTab = (next: Tab) =>
    router.replace(next === "check" ? pathname : `${pathname}?tab=${next}`, { scroll: false });
  return (
    <>
      <PageHeader
        title="Video extraction"
        description="Find the videos on a website, check whether NETFLY can embed them, and save the approved ones for the viewer app."
      />
      <Tabs.Root value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <Tabs.List className="border-line mb-4 flex gap-1 border-b" aria-label="Video extraction">
          {(
            [
              ["check", "Check a site"],
              ["approved", "Approved embeds"],
            ] as const
          ).map(([value, label]) => (
            <Tabs.Trigger
              key={value}
              value={value}
              className={cn(
                "-mb-px h-9 border-b-2 px-3 text-[13px] transition-colors",
                tab === value
                  ? "border-accent text-fg font-medium"
                  : "text-muted hover:text-fg border-transparent",
              )}
            >
              {label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <Tabs.Content value="check" className="space-y-4 outline-none">
          <StartForm />
          <JobsList />
        </Tabs.Content>
        <Tabs.Content value="approved" className="outline-none">
          <ApprovedEmbeds />
        </Tabs.Content>
      </Tabs.Root>
    </>
  );
}

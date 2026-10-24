"use client";

import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AccountPanel } from "@/components/account/account-nav";
import { useProfiles } from "@/components/providers/profile";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function ProfilesPage() {
  const profiles = useProfiles();
  const router = useRouter();
  // Playback settings moved to their own section; old links to this page land there.
  useEffect(() => {
    if (!profiles.enabled) router.replace("/account/playback");
  }, [profiles.enabled, router]);
  if (!profiles.enabled) return <Skeleton className="h-40 rounded" />;
  return (
    <AccountPanel
      title="Profiles"
      description="Each profile has its own Continue Watching, My List and recommendations. Playback settings apply to every profile."
      actions={
        <Button
          variant="accent"
          className="rounded"
          icon={<Pencil />}
          onClick={() => profiles.openGate("manage")}
        >
          Manage profiles
        </Button>
      }
    >
      <p className="text-body text-[#b3b3b3]">
        Watching as <span className="font-semibold text-white">{profiles.active?.name}</span>.
      </p>
    </AccountPanel>
  );
}

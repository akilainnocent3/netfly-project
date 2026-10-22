"use client";

import { Pencil } from "lucide-react";
import { AccountPanel } from "@/components/account/account-nav";
import { PlaybackSettings } from "@/components/account/settings";
import { useAuth } from "@/components/providers/auth";
import { useProfiles } from "@/components/providers/profile";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function ProfilesPage() {
  const { user } = useAuth();
  const profiles = useProfiles();
  return (
    <div className="space-y-6">
      {profiles.enabled ? (
        <AccountPanel
          title="Profiles"
          description="Each profile has its own Continue Watching, My List and recommendations."
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
      ) : null}
      <AccountPanel
        title="Playback settings"
        description="Every plan streams in the same, best quality."
      >
        {user ? <PlaybackSettings user={user} /> : <Skeleton className="h-40 rounded" />}
      </AccountPanel>
    </div>
  );
}

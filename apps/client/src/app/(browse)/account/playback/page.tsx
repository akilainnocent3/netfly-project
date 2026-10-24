"use client";

import { AccountPanel } from "@/components/account/account-nav";
import { PlaybackSettings } from "@/components/account/settings";
import { useAuth } from "@/components/providers/auth";
import { useProfiles } from "@/components/providers/profile";
import { Skeleton } from "@/components/ui/skeleton";

export default function PlaybackPage() {
  const { user } = useAuth();
  const profiles = useProfiles();
  return (
    <AccountPanel
      title="Playback"
      description={
        profiles.enabled
          ? "Autoplay, quality and subtitles for every profile on this account. Every plan streams in the same, best quality."
          : "Autoplay, quality and subtitles. Every plan streams in the same, best quality."
      }
    >
      {user ? <PlaybackSettings user={user} /> : <Skeleton className="h-40 rounded" />}
    </AccountPanel>
  );
}

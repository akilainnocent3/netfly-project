"use client";

import { unwrap, type Schemas } from "@netfly/api-client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "./auth";
import { useConfig } from "./config";

export type Profile = Schemas["Profile"];

const STORAGE = "netfly_profile";

function readStored(): { u: number; p: number } | null {
  try {
    const raw = localStorage.getItem(STORAGE);
    return raw ? (JSON.parse(raw) as { u: number; p: number }) : null;
  } catch {
    return null;
  }
}

function writeStored(value: { u: number; p: number } | null): void {
  try {
    if (value) localStorage.setItem(STORAGE, JSON.stringify(value));
    else localStorage.removeItem(STORAGE);
  } catch {
    // Private mode: the choice just isn't remembered across reloads.
  }
}

// Set before the first request of the page so early fetches are already profile-scoped.
if (typeof window !== "undefined") {
  const stored = readStored();
  if (stored) api.session.profileId = stored.p;
}

interface ProfileValue {
  /** `features.profiles_enabled` (public config). When false nothing here renders. */
  enabled: boolean;
  profiles: Profile[];
  maxProfiles: number;
  avatars: string[];
  active: Profile | null;
  /** True once we know whether the gate must be shown. */
  ready: boolean;
  gate: "closed" | "choose" | "manage";
  choose: (profile: Profile) => void;
  openGate: (mode?: "choose" | "manage") => void;
  closeGate: () => void;
  refresh: () => Promise<unknown>;
}

const ProfileContext = createContext<ProfileValue | null>(null);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const config = useConfig();
  const { user, status } = useAuth();
  const queryClient = useQueryClient();
  const enabled = config.bool("features.profiles_enabled", false);
  const [chosen, setChosen] = useState<number | null>(() =>
    typeof window === "undefined" ? null : (readStored()?.p ?? null),
  );
  const [gate, setGate] = useState<"closed" | "choose" | "manage">("closed");

  const list = useQuery({
    queryKey: ["profiles", user?.id],
    enabled: enabled && status === "authenticated",
    queryFn: () => unwrap(api.GET("/api/v1/profiles")),
    staleTime: 5 * 60_000,
  });
  const profiles = useMemo(() => list.data?.results ?? [], [list.data]);
  const stored = typeof window === "undefined" ? null : readStored();
  const active = (user && stored?.u === user.id && profiles.find((p) => p.id === chosen)) || null;

  const choose = useCallback(
    (profile: Profile) => {
      if (!user) return;
      writeStored({ u: user.id, p: profile.id });
      api.session.profileId = profile.id;
      setChosen(profile.id);
      setGate("closed");
      // Everything personal (rows, list, ratings, progress) belonged to the previous profile:
      // reset it all, and refetch whatever is on screen under the new one.
      void queryClient.resetQueries({ predicate: (q) => q.queryKey[0] !== "profiles" });
    },
    [queryClient, user],
  );

  const ready =
    !enabled || status === "anonymous" || (status === "authenticated" && !list.isPending);
  const value = useMemo<ProfileValue>(
    () => ({
      enabled: enabled && !!list.data?.enabled,
      profiles,
      maxProfiles: list.data?.max_profiles ?? 5,
      avatars: list.data?.avatars ?? [],
      active,
      ready,
      gate,
      choose,
      openGate: (mode = "choose") => setGate(mode),
      closeGate: () => setGate("closed"),
      refresh: () => list.refetch(),
    }),
    [enabled, list, profiles, active, ready, gate, choose],
  );
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfiles(): ProfileValue {
  const value = useContext(ProfileContext);
  if (!value) throw new Error("useProfiles must be used inside <ProfileProvider>");
  return value;
}

export function forgetProfile(): void {
  writeStored(null);
  api.session.profileId = null;
}

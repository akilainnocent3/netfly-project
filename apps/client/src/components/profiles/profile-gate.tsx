"use client";

import { cn, LazyLogoLoader } from "@netfly/ui";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, m } from "framer-motion";
import { Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { useProfiles, type Profile } from "../providers/profile";
import { Button } from "../ui/button";
import { Avatar } from "./avatar";
import { ProfileEditor } from "./profile-editor";
import { Pressable } from "../ui/pressable";

/**
 * Full-screen "Who's watching?" (and Manage Profiles). Personal content stays unmounted until
 * a profile is chosen, so nothing is fetched under the wrong profile.
 */
export function ProfileGate({ children }: { children: React.ReactNode }) {
  const p = useProfiles();
  if (!p.enabled) return <>{p.ready ? children : <GateLoading />}</>;
  const mustChoose = !p.active;
  const open = mustChoose || p.gate !== "closed";
  return (
    <>
      {!mustChoose && children}
      <AnimatePresence>
        {open && <Gate key="gate" manage={p.gate === "manage"} dismissible={!mustChoose} />}
      </AnimatePresence>
    </>
  );
}

function GateLoading() {
  return (
    <div className="bg-bg fixed inset-0 z-[110] grid place-items-center" aria-busy>
      <LazyLogoLoader size="lg" label="Loading profiles" />
    </div>
  );
}

function Gate({ manage: manageInitially, dismissible }: { manage: boolean; dismissible: boolean }) {
  const p = useProfiles();
  const [manage, setManage] = useState(manageInitially);
  const [editing, setEditing] = useState<Profile | "new" | null>(null);
  const canAdd = p.profiles.length < p.maxProfiles;

  return (
    <Dialog.Root open onOpenChange={(o) => !o && dismissible && p.closeGate()}>
      <Dialog.Portal>
        <Dialog.Content
          aria-describedby={undefined}
          data-testid="profile-gate"
          onEscapeKeyDown={(e) => !dismissible && e.preventDefault()}
          className="bg-bg fixed inset-0 z-[110] overflow-y-auto outline-none"
        >
          <m.div
            initial={{ opacity: 0, scale: 1.04 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.04 }}
            transition={{ duration: 0.3 }}
            className="flex min-h-full flex-col items-center justify-center px-4 py-16"
          >
            <Dialog.Title className="text-title mb-8 text-center font-medium md:mb-10">
              {manage ? "Manage Profiles" : "Who's watching?"}
            </Dialog.Title>
            <ul className="flex max-w-5xl flex-wrap justify-center gap-[clamp(12px,2vw,28px)]">
              {p.profiles.map((profile) => (
                <li key={profile.id}>
                  <Pressable
                    onClick={() => (manage ? setEditing(profile) : p.choose(profile))}
                    aria-label={manage ? `Edit ${profile.name}` : `Watch as ${profile.name}`}
                    className="group flex w-[clamp(84px,10vw,150px)] flex-col items-center gap-3 focus-visible:outline-none active:scale-100"
                  >
                    <span className="relative w-full rounded-md ring-white transition group-hover:ring-[3px] group-focus-visible:ring-[3px]">
                      <Avatar
                        avatarKey={profile.avatar_key}
                        className={cn(manage && "opacity-50")}
                      />
                      {manage && (
                        <span className="absolute inset-0 grid place-items-center">
                          <Pencil className="size-1/3 text-white" />
                        </span>
                      )}
                      {profile.is_kids && (
                        <span className="text-caption absolute bottom-1.5 left-1.5 rounded-sm bg-white px-1 font-black text-black">
                          KIDS
                        </span>
                      )}
                    </span>
                    <span className="text-body max-w-full truncate text-white/60 transition-colors group-hover:text-white group-focus-visible:text-white">
                      {profile.name}
                    </span>
                  </Pressable>
                </li>
              ))}
              {canAdd && (
                <li>
                  <Pressable
                    onClick={() => setEditing("new")}
                    className="group flex w-[clamp(84px,10vw,150px)] flex-col items-center gap-3 focus-visible:outline-none active:scale-100"
                  >
                    <span className="grid aspect-square w-full place-items-center rounded-md text-white/60 ring-white transition group-hover:bg-white/10 group-hover:text-white group-hover:ring-[3px] group-focus-visible:ring-[3px]">
                      <Plus className="size-1/2" strokeWidth={1.4} />
                    </span>
                    <span className="text-body text-white/60 group-hover:text-white">
                      Add Profile
                    </span>
                  </Pressable>
                </li>
              )}
            </ul>
            <div className="mt-12 flex gap-3">
              {manage ? (
                <Button
                  variant="accent"
                  size="lg"
                  onClick={() =>
                    manageInitially && dismissible ? p.closeGate() : setManage(false)
                  }
                >
                  Done
                </Button>
              ) : (
                p.profiles.length > 0 && (
                  <Button
                    variant="ghost"
                    size="lg"
                    className="rounded-none border border-white/50 tracking-[0.15em] text-white/60 uppercase hover:border-white hover:bg-transparent"
                    onClick={() => setManage(true)}
                  >
                    Manage Profiles
                  </Button>
                )
              )}
            </div>
          </m.div>
          {editing && (
            <ProfileEditor
              key={editing === "new" ? "new" : editing.id}
              profile={editing === "new" ? null : editing}
              open
              onClose={() => setEditing(null)}
            />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

"use client";

import { ApiError, unwrap } from "@netfly/api-client";
import { cn } from "@netfly/ui";
import * as Dialog from "@radix-ui/react-dialog";
import { Check } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api";
import { useProfiles, type Profile } from "../providers/profile";
import { Button } from "../ui/button";
import { Field } from "../ui/field";
import { SwitchRow } from "../ui/switch";
import { useToast } from "../ui/toast";
import { Avatar } from "./avatar";
import { Pressable } from "../ui/pressable";

type AvatarKey = NonNullable<Profile["avatar_key"]>;

/** Create or edit a profile. Explicit Save; Delete asks for a second, explicit confirmation. */
export function ProfileEditor({
  profile,
  open,
  onClose,
}: {
  profile: Profile | null;
  open: boolean;
  onClose: () => void;
}) {
  const { avatars, refresh, active, choose } = useProfiles();
  const toast = useToast();
  const [name, setName] = useState(profile?.name ?? "");
  const [avatar, setAvatar] = useState<AvatarKey>(
    profile?.avatar_key ?? (avatars[0] as AvatarKey | undefined) ?? "avatar-1",
  );
  const [kids, setKids] = useState(profile?.is_kids ?? false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = async () => {
    if (busy) return;
    if (!name.trim()) return setError("Give the profile a name.");
    setBusy("save");
    setError(undefined);
    try {
      const body = { name: name.trim(), avatar_key: avatar, is_kids: kids };
      const saved = profile
        ? await unwrap(
            api.PATCH("/api/v1/profiles/{id}", { params: { path: { id: profile.id } }, body }),
          )
        : await unwrap(api.POST("/api/v1/profiles", { body }));
      await refresh();
      if (active?.id === saved.id) choose(saved);
      toast({ message: profile ? "Profile saved" : `Added ${saved.name}`, tone: "success" }, 2200);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? (e.fields.name ?? e.message) : "Couldn't save the profile.");
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!profile || busy) return;
    if (!confirmDelete) return setConfirmDelete(true);
    setBusy("delete");
    try {
      await unwrap(api.DELETE("/api/v1/profiles/{id}", { params: { path: { id: profile.id } } }));
      await refresh();
      toast({ message: `Deleted ${profile.name}`, tone: "success" }, 2200);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't delete the profile.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[120] bg-black/80" />
        <Dialog.Content
          aria-describedby={undefined}
          className="bg-bg fixed top-1/2 left-1/2 z-[121] max-h-[92dvh] w-[min(560px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-md p-6 ring-1 ring-white/10 md:p-8"
        >
          <Dialog.Title className="text-h2 mb-6 font-bold">
            {profile ? "Edit Profile" : "Add Profile"}
          </Dialog.Title>
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
            className="space-y-5"
          >
            <div className="flex items-center gap-4">
              <Avatar avatarKey={avatar} className="w-20 shrink-0" />
              <Field
                label="Name"
                value={name}
                maxLength={40}
                autoFocus
                error={error}
                onChange={(e) => setName(e.target.value)}
                className="flex-1"
              />
            </div>
            <fieldset>
              <legend className="text-body mb-2 font-semibold">Choose an icon</legend>
              <div className="grid grid-cols-6 gap-2" role="radiogroup" aria-label="Profile icon">
                {avatars.map((key) => (
                  <Pressable
                    key={key}
                    role="radio"
                    aria-checked={avatar === key}
                    aria-label={`Icon ${key.replace(/\D/g, "")}`}
                    onClick={() => setAvatar(key as AvatarKey)}
                    className={cn(
                      "relative rounded-md outline-offset-2 transition-transform duration-150 hover:scale-105 focus-visible:outline-2 focus-visible:outline-white",
                      avatar === key && "ring-2 ring-white",
                    )}
                  >
                    <Avatar avatarKey={key} />
                    {avatar === key && (
                      <Check className="absolute right-1 bottom-1 size-4 rounded-full bg-black/60 p-0.5 text-white" />
                    )}
                  </Pressable>
                ))}
              </div>
            </fieldset>
            <SwitchRow
              label="Kids profile"
              description="Only titles rated for kids, and a simpler home."
              checked={kids}
              onChange={setKids}
            />
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button type="submit" variant="play" loading={busy === "save"} disabled={!!busy}>
                Save
              </Button>
              <Button type="button" variant="ghost" onClick={onClose} disabled={!!busy}>
                Cancel
              </Button>
              {profile && (
                <Button
                  variant={confirmDelete ? "accent" : "ghost"}
                  className="ml-auto"
                  loading={busy === "delete"}
                  disabled={!!busy && busy !== "delete"}
                  onClick={() => void remove()}
                >
                  {confirmDelete ? "Delete — this can't be undone" : "Delete profile"}
                </Button>
              )}
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

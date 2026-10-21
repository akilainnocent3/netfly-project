"use client";

import { Bell, BellRing } from "lucide-react";
import { usePendingFor, useReminder } from "@/lib/queries";
import type { TitleCard } from "@/lib/types";
import { useAuthGate } from "../auth/auth-gate";
import { Button } from "../ui/button";

/** "Remind me" toggle for Coming Soon titles. One request at a time per title. */
export function RemindButton({
  title,
  reminded,
}: {
  title: Pick<TitleCard, "id" | "title" | "slug">;
  reminded: boolean;
}) {
  const reminder = useReminder(title);
  const pending = usePendingFor("reminder", title.id);
  const gate = useAuthGate();
  return (
    <Button
      variant={reminded ? "play" : "secondary"}
      size="sm"
      aria-pressed={reminded}
      loading={pending}
      icon={reminded ? <BellRing /> : <Bell />}
      onClick={() =>
        gate({ action: "remind", slug: title.slug, titleId: title.id, titleName: title.title }) &&
        reminder.toggleNow(!reminded)
      }
    >
      {reminded ? "Reminder set" : "Remind me"}
    </Button>
  );
}

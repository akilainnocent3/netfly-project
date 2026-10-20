"use client";

import { unwrap } from "@netfly/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { CircleAlert, CircleCheck, Rocket } from "lucide-react";
import { useAction } from "@/components/ui/actions";
import { Button, Card, Input, Label, Switch } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import type { TitleDetail } from "@/lib/types";
import { PrioritySegmented, explainPriority } from "../priority";
import { StatusChip } from "../status";

/** `datetime-local` works in local time; ISO strings are UTC. */
export const toLocal = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
export const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);

export function PublishingTab({
  title,
  onChange,
  errors,
  readOnly,
}: {
  title: TitleDetail;
  onChange: (patch: Partial<TitleDetail>) => void;
  errors: Record<string, string>;
  readOnly: boolean;
}) {
  const queryClient = useQueryClient();
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["title", title.id] });

  const publish = useAction(
    async (verb: "publish" | "unpublish") => {
      const updated = await unwrap(
        verb === "publish"
          ? api.POST("/api/v1/admin/titles/{id}/publish", { params: { path: { id: title.id } } })
          : api.POST("/api/v1/admin/titles/{id}/unpublish", { params: { path: { id: title.id } } }),
      );
      queryClient.setQueryData(["title", title.id], updated);
      return updated;
    },
    {
      success: (u) =>
        u.status === "processing"
          ? "Will go live when the video finishes processing"
          : u.status === "published"
            ? "Published"
            : "Moved to draft",
    },
  );

  const billboard = useAction(
    async (on: boolean) => {
      const existing = await unwrap(api.GET("/api/v1/admin/billboards"));
      const mine = existing.filter((b) => b.title === title.id);
      if (on && !mine.length)
        await unwrap(api.POST("/api/v1/admin/billboards", { body: { title: title.id } }));
      if (!on)
        await Promise.all(
          mine.map((b) =>
            unwrap(api.DELETE("/api/v1/admin/billboards/{id}", { params: { path: { id: b.id } } })),
          ),
        );
      refresh();
      return on;
    },
    { success: (on) => (on ? "Added to the home billboard" : "Removed from the billboard") },
  );

  const blockers = title.publish_blockers;
  const live = title.status === "published" || title.status === "processing";
  const boost = title.boost ?? 0;
  return (
    <fieldset disabled={readOnly} className="grid gap-4 lg:grid-cols-2">
      <Card className="space-y-4 p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Status</p>
            <p className="text-muted text-[12.5px]">
              {title.published_at
                ? `First published ${new Date(title.published_at).toLocaleString()}`
                : "Not published yet."}
            </p>
          </div>
          <StatusChip status={title.status} />
        </div>
        {blockers.length > 0 && !live ? (
          <ul className="space-y-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-[12.5px]">
            {blockers.map((b) => (
              <li key={b} className="flex gap-2">
                <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-500" /> {b}
              </li>
            ))}
          </ul>
        ) : !live ? (
          <p className="flex items-center gap-2 text-[12.5px] text-emerald-600 dark:text-emerald-400">
            <CircleCheck className="size-4" /> Ready to publish.
          </p>
        ) : null}
        <div className="flex gap-2">
          {live ? (
            <Button onClick={() => void publish.run("unpublish")} loading={publish.pending}>
              Unpublish
            </Button>
          ) : (
            <Button
              variant="primary"
              disabled={blockers.length > 0}
              onClick={() => void publish.run("publish")}
              loading={publish.pending}
            >
              Publish now
            </Button>
          )}
        </div>
        <div>
          <Label htmlFor="p-at" hint="Publishes automatically">
            Schedule
          </Label>
          <Input
            id="p-at"
            type="datetime-local"
            value={toLocal(title.publish_at)}
            onChange={(e) => onChange({ publish_at: fromLocal(e.target.value) })}
          />
        </div>
        <div className="border-line flex items-center justify-between rounded-md border p-3">
          <div>
            <p className="font-medium">Featured</p>
            <p className="text-muted text-[12.5px]">Boosted in new viewers&apos; feeds.</p>
          </div>
          <Switch
            checked={!!title.is_featured}
            onCheckedChange={(v) => onChange({ is_featured: v })}
            label="Featured"
            disabled={readOnly}
          />
        </div>
        <div className="border-line flex items-center justify-between rounded-md border p-3">
          <div>
            <p className="font-medium">Home billboard</p>
            <p className="text-muted text-[12.5px]">
              {billboard.pending ? "Saving…" : "Rotate this title in the hero."}
            </p>
          </div>
          <Switch
            checked={title.is_billboard}
            onCheckedChange={(v) => void billboard.run(v)}
            label="Home billboard"
            disabled={readOnly || billboard.pending}
          />
        </div>
      </Card>

      <div className="space-y-4">
        <Card className="space-y-4 p-5">
          <div className="flex items-start gap-3">
            <span className="bg-accent/10 text-accent grid size-8 shrink-0 place-items-center rounded-md">
              <Rocket className="size-4" />
            </span>
            <div>
              <p className="font-medium">Recommendation priority</p>
              <p className="text-muted text-[12.5px]">
                Applies to Top picks, genre rows, new releases and the billboard. Top 10 and
                Trending stay data-driven.
              </p>
            </div>
          </div>
          <PrioritySegmented
            value={boost}
            onChange={(v) => onChange({ boost: v })}
            disabled={readOnly}
          />
          <p className="text-[12.5px]" aria-live="polite" data-testid="priority-explanation">
            {explainPriority(boost, title.boost_starts_at, title.boost_ends_at)}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="b-start" hint="optional">
                Campaign starts
              </Label>
              <Input
                id="b-start"
                type="datetime-local"
                value={toLocal(title.boost_starts_at)}
                onChange={(e) => onChange({ boost_starts_at: fromLocal(e.target.value) })}
              />
            </div>
            <div>
              <Label htmlFor="b-end" hint="optional">
                Campaign ends
              </Label>
              <Input
                id="b-end"
                type="datetime-local"
                value={toLocal(title.boost_ends_at)}
                invalid={!!errors.boost_ends_at}
                onChange={(e) => onChange({ boost_ends_at: fromLocal(e.target.value) })}
              />
              {errors.boost_ends_at && (
                <p className="mt-1 text-[12px] text-red-500">{errors.boost_ends_at}</p>
              )}
            </div>
          </div>
        </Card>
        <Card className="space-y-4 p-5">
          <div>
            <p className="font-medium">Rights & license</p>
            <p className="text-muted text-[12.5px]">
              Titles unpublish automatically when the license ends; staff are warned beforehand.
            </p>
          </div>
          <div>
            <Label htmlFor="p-rights">Rights holder</Label>
            <Input
              id="p-rights"
              value={title.rights_holder ?? ""}
              onChange={(e) => onChange({ rights_holder: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="p-ls">License start</Label>
              <Input
                id="p-ls"
                type="datetime-local"
                value={toLocal(title.license_start)}
                onChange={(e) => onChange({ license_start: fromLocal(e.target.value) })}
              />
            </div>
            <div>
              <Label htmlFor="p-le">License end</Label>
              <Input
                id="p-le"
                type="datetime-local"
                value={toLocal(title.license_end)}
                invalid={!!errors.license_end}
                onChange={(e) => onChange({ license_end: fromLocal(e.target.value) })}
              />
              {errors.license_end && (
                <p className="mt-1 text-[12px] text-red-500">{errors.license_end}</p>
              )}
            </div>
          </div>
        </Card>
      </div>
    </fieldset>
  );
}

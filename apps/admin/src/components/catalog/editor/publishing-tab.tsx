"use client";

import { ApiError, unwrap } from "@netfly/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { CircleAlert, CircleCheck } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/components/providers/toast";
import { Button, Card, Input, Label, Switch } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import type { TitleDetail } from "@/lib/types";
import { StatusChip } from "../status";

const toLocal = (iso?: string | null) => (iso ? new Date(iso).toISOString().slice(0, 16) : "");
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);

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
  const toast = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["title", title.id] });

  const publish = async (verb: "publish" | "unpublish") => {
    setBusy(true);
    try {
      const updated = await unwrap(
        verb === "publish"
          ? api.POST("/api/v1/admin/titles/{id}/publish", { params: { path: { id: title.id } } })
          : api.POST("/api/v1/admin/titles/{id}/unpublish", { params: { path: { id: title.id } } }),
      );
      toast(updated.status === "processing" ? "Will go live when the video finishes processing" : verb === "publish" ? "Published" : "Moved to draft");
      queryClient.setQueryData(["title", title.id], updated);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't change status", "error");
    } finally {
      setBusy(false);
    }
  };

  const toggleBillboard = async (on: boolean) => {
    const existing = await unwrap(api.GET("/api/v1/admin/billboards"));
    const mine = existing.filter((b) => b.title === title.id);
    if (on && !mine.length) await unwrap(api.POST("/api/v1/admin/billboards", { body: { title: title.id } }));
    if (!on) await Promise.all(mine.map((b) => unwrap(api.DELETE("/api/v1/admin/billboards/{id}", { params: { path: { id: b.id } } }))));
    toast(on ? "Added to the home billboard" : "Removed from the billboard");
    refresh();
  };

  const blockers = title.publish_blockers;
  const live = title.status === "published" || title.status === "processing";
  return (
    <fieldset disabled={readOnly} className="grid gap-4 lg:grid-cols-2">
      <Card className="space-y-4 p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Status</p>
            <p className="text-[12.5px] text-muted">{title.published_at ? `First published ${new Date(title.published_at).toLocaleString()}` : "Not published yet."}</p>
          </div>
          <StatusChip status={title.status} />
        </div>
        {blockers.length > 0 && !live ? (
          <ul className="space-y-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-[12.5px]">
            {blockers.map((b) => (
              <li key={b} className="flex gap-2"><CircleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-500" /> {b}</li>
            ))}
          </ul>
        ) : !live ? (
          <p className="flex items-center gap-2 text-[12.5px] text-emerald-600 dark:text-emerald-400"><CircleCheck className="size-4" /> Ready to publish.</p>
        ) : null}
        <div className="flex gap-2">
          {live ? (
            <Button onClick={() => void publish("unpublish")} loading={busy}>Unpublish</Button>
          ) : (
            <Button variant="primary" disabled={blockers.length > 0} onClick={() => void publish("publish")} loading={busy}>Publish now</Button>
          )}
        </div>
        <div>
          <Label htmlFor="p-at" hint="Publishes automatically">Schedule</Label>
          <Input id="p-at" type="datetime-local" value={toLocal(title.publish_at)} onChange={(e) => onChange({ publish_at: fromLocal(e.target.value) })} />
        </div>
        <div className="flex items-center justify-between rounded-md border border-line p-3">
          <div>
            <p className="font-medium">Featured</p>
            <p className="text-[12.5px] text-muted">Boosted in new viewers&apos; feeds.</p>
          </div>
          <Switch checked={!!title.is_featured} onCheckedChange={(v) => onChange({ is_featured: v })} label="Featured" disabled={readOnly} />
        </div>
        <div className="flex items-center justify-between rounded-md border border-line p-3">
          <div>
            <p className="font-medium">Home billboard</p>
            <p className="text-[12.5px] text-muted">Rotate this title in the hero.</p>
          </div>
          <Switch checked={title.is_billboard} onCheckedChange={(v) => void toggleBillboard(v)} label="Home billboard" disabled={readOnly} />
        </div>
      </Card>
      <Card className="space-y-4 p-5">
        <div>
          <p className="font-medium">Rights & license</p>
          <p className="text-[12.5px] text-muted">Titles unpublish automatically when the license ends; staff are warned beforehand.</p>
        </div>
        <div>
          <Label htmlFor="p-rights">Rights holder</Label>
          <Input id="p-rights" value={title.rights_holder ?? ""} onChange={(e) => onChange({ rights_holder: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="p-ls">License start</Label>
            <Input id="p-ls" type="datetime-local" value={toLocal(title.license_start)} onChange={(e) => onChange({ license_start: fromLocal(e.target.value) })} />
          </div>
          <div>
            <Label htmlFor="p-le">License end</Label>
            <Input id="p-le" type="datetime-local" value={toLocal(title.license_end)} invalid={!!errors.license_end} onChange={(e) => onChange({ license_end: fromLocal(e.target.value) })} />
            {errors.license_end && <p className="mt-1 text-[12px] text-red-500">{errors.license_end}</p>}
          </div>
        </div>
      </Card>
    </fieldset>
  );
}

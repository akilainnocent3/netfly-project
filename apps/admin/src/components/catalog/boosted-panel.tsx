"use client";

import { unwrap } from "@netfly/api-client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Rocket } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { errorMessage } from "../ui/actions";
import { useToast } from "../providers/toast";
import { Card, Empty, Skeleton } from "../ui/primitives";
import { PriorityBadge, PrioritySegmented, priorityLabel } from "./priority";
import { Thumb } from "./thumb";

/** Active recommendation boosts at a glance, with one-click edits. */
export function BoostedPanel({ readOnly }: { readOnly: boolean }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<Record<number, number>>({});
  const boosted = useQuery({
    queryKey: ["titles", "boosted"],
    queryFn: () =>
      unwrap(
        api.GET("/api/v1/admin/titles", {
          params: { query: { priority: "boosted", ordering: "-boost", page_size: 50 } },
        }),
      ),
  });

  const setBoost = async (id: number, boost: number, name: string) => {
    if (pending[id] !== undefined) return;
    setPending((p) => ({ ...p, [id]: boost }));
    try {
      await unwrap(
        api.PATCH("/api/v1/admin/titles/{id}", { params: { path: { id } }, body: { boost } }),
      );
      toast(`${name}: ${priorityLabel(boost)}`);
      void queryClient.invalidateQueries({ queryKey: ["titles"] });
      void queryClient.invalidateQueries({ queryKey: ["title", id] });
    } catch (e) {
      toast(errorMessage(e, "Couldn't change priority"), "error");
    } finally {
      setPending((p) => {
        const next = { ...p };
        delete next[id];
        return next;
      });
    }
  };

  const rows = boosted.data?.results ?? [];
  return (
    <Card>
      <div className="border-line flex items-center justify-between border-b px-4 py-3">
        <div>
          <p className="flex items-center gap-1.5 font-medium">
            <Rocket className="text-accent size-4" /> Boosted titles
          </p>
          <p className="text-muted text-[12.5px]">
            Shown higher in Top picks, genre rows and the billboard. Takes effect immediately.
          </p>
        </div>
        <Link
          href="/titles?priority=boosted&ordering=-boost"
          className="text-accent text-[12.5px] hover:underline"
        >
          All prioritised →
        </Link>
      </div>
      {boosted.isPending ? (
        <div className="space-y-2 p-4">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : rows.length ? (
        <ul className="divide-line divide-y">
          {rows.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-2">
              <Thumb image={t.poster} />
              <div className="min-w-0 flex-1">
                <Link
                  href={`/titles/${t.id}`}
                  className="block truncate font-medium hover:underline"
                >
                  {t.title}
                </Link>
                <PriorityBadge boost={t.boost ?? 0} effective={t.effective_boost} />
                {t.boost_ends_at && (
                  <span className="text-subtle ml-2 text-[12px]">
                    until {new Date(t.boost_ends_at).toLocaleDateString()}
                  </span>
                )}
              </div>
              {!readOnly && (
                <PrioritySegmented
                  size="sm"
                  value={t.boost ?? 0}
                  pending={pending[t.id] ?? null}
                  onChange={(v) => void setBoost(t.id, v, t.title)}
                />
              )}
            </li>
          ))}
        </ul>
      ) : (
        <Empty title="No boosted titles">
          Set a priority on a title&apos;s Publishing tab, or select titles and use “Set priority…”.
        </Empty>
      )}
    </Card>
  );
}

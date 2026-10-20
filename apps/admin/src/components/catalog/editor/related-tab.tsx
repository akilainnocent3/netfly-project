"use client";

import { ApiError, unwrap } from "@netfly/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, ArrowRight, Link2, Plus, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/components/providers/toast";
import { Button, Card, Empty, Input, Skeleton, Switch } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { useDebounced } from "@/lib/use-debounced";
import { Thumb } from "../thumb";

export function RelatedTab({ titleId, readOnly }: { titleId: number; readOnly: boolean }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [twoWay, setTwoWay] = useState(true);
  const [weight, setWeight] = useState(3);
  const query = useDebounced(q, 200);
  const key = ["related", titleId];

  const links = useQuery({
    queryKey: key,
    queryFn: () =>
      unwrap(api.GET("/api/v1/admin/titles/{id}/related", { params: { path: { id: titleId } } })),
  });
  const picker = useQuery({
    queryKey: ["picker", query, titleId],
    queryFn: () =>
      unwrap(
        api.GET("/api/v1/admin/title-picker", {
          params: { query: { q: query, exclude: titleId } },
        }),
      ),
  });
  const linked = new Set(links.data?.map((l) => l.related.id));

  const add = useMutation({
    mutationFn: (relatedId: number) =>
      unwrap(
        api.POST("/api/v1/admin/titles/{id}/related", {
          params: { path: { id: titleId } },
          body: { related_id: relatedId, weight, two_way: twoWay },
        }),
      ),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: key }),
    onError: (e) => toast(e instanceof ApiError ? e.message : "Couldn't link", "error"),
  });
  const update = useMutation({
    mutationFn: ({ id, w }: { id: number; w: number }) =>
      unwrap(
        api.PATCH("/api/v1/admin/related/{id}", { params: { path: { id } }, body: { weight: w } }),
      ),
    onSuccess: () => toast("Weight saved"),
  });
  const remove = useMutation({
    mutationFn: ({ id, both }: { id: number; both: boolean }) =>
      unwrap(
        api.DELETE("/api/v1/admin/related/{id}", {
          params: { path: { id }, query: { two_way: both } },
        }),
      ),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: key }),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <Card>
        <div className="border-line border-b px-4 py-3">
          <p className="font-medium">Related titles</p>
          <p className="text-muted text-[12.5px]">
            The strongest recommendation signal: viewers who like this title see these first.
          </p>
        </div>
        {links.isPending ? (
          <div className="space-y-2 p-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : links.data?.length ? (
          <ul className="divide-line divide-y">
            {links.data.map((link) => (
              <li key={link.id} className="flex items-center gap-3 px-4 py-2.5">
                <Thumb image={link.related.poster} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{link.related.title}</p>
                  <p className="text-muted flex items-center gap-1 text-[12px]">
                    {link.is_two_way ? (
                      <ArrowLeftRight className="size-3" />
                    ) : (
                      <ArrowRight className="size-3" />
                    )}
                    {link.is_two_way ? "Two-way" : "One-way"} · {link.related.type}
                    {link.related.year ? ` · ${link.related.year}` : ""}
                  </p>
                </div>
                <label className="text-muted flex items-center gap-2 text-[12px]">
                  Weight
                  <input
                    type="range"
                    min={1}
                    max={5}
                    defaultValue={link.weight}
                    disabled={readOnly}
                    onMouseUp={(e) =>
                      update.mutate({
                        id: link.id,
                        w: Number((e.target as HTMLInputElement).value),
                      })
                    }
                    onKeyUp={(e) =>
                      update.mutate({
                        id: link.id,
                        w: Number((e.target as HTMLInputElement).value),
                      })
                    }
                    className="w-24 accent-[var(--accent)]"
                    aria-label={`Weight for ${link.related.title}`}
                  />
                </label>
                {!readOnly && (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Remove"
                    onClick={() => remove.mutate({ id: link.id, both: link.is_two_way })}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <Empty icon={<Link2 className="size-7" />} title="No related titles yet">
            Search on the right and add titles that fans of this one will love.
          </Empty>
        )}
      </Card>
      {!readOnly && (
        <Card className="p-4">
          <div className="relative">
            <Search className="text-subtle pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Find a title…"
              className="pl-8"
              aria-label="Find a title"
            />
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 text-[12.5px]">
            <label className="flex items-center gap-2">
              <Switch checked={twoWay} onCheckedChange={setTwoWay} label="Two-way" /> Two-way
            </label>
            <label className="text-muted flex items-center gap-2">
              Weight {weight}
              <input
                type="range"
                min={1}
                max={5}
                value={weight}
                onChange={(e) => setWeight(Number(e.target.value))}
                className="w-20 accent-[var(--accent)]"
                aria-label="Weight for new links"
              />
            </label>
          </div>
          <ul className="mt-3 max-h-[420px] space-y-0.5 overflow-y-auto">
            {picker.data?.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  disabled={linked.has(t.id) || add.isPending}
                  onClick={() => add.mutate(t.id)}
                  className="hover:bg-hover flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left disabled:opacity-40"
                >
                  <Thumb image={t.poster} className="w-7" />
                  <span className="min-w-0 flex-1 truncate">{t.title}</span>
                  {linked.has(t.id) ? (
                    <span className="text-subtle text-[11.5px]">linked</span>
                  ) : (
                    <Plus className="text-subtle size-3.5" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

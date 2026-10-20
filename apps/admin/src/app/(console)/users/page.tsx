"use client";

import { ApiError, unwrap } from "@netfly/api-client";
import { cn } from "@netfly/ui";
import * as Dialog from "@radix-ui/react-dialog";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, KeyRound, Search, ThumbsDown, ThumbsUp, Users, X } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/components/providers/auth";
import { useToast } from "@/components/providers/toast";
import {
  Badge,
  Button,
  Card,
  Empty,
  Input,
  PageHeader,
  Skeleton,
} from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { useDebounced } from "@/lib/use-debounced";

export default function UsersPage() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<number | null>(null);
  const search = useDebounced(q, 250);
  const users = useQuery({
    queryKey: ["users", search, page],
    queryFn: () =>
      unwrap(
        api.GET("/api/v1/admin/users", {
          params: { query: { search: search || undefined, page } },
        }),
      ),
    placeholderData: keepPreviousData,
  });
  return (
    <>
      <PageHeader
        title="Users"
        description={users.data ? `${users.data.count} accounts` : "Viewer accounts."}
      />
      <div className="relative mb-3 max-w-xs">
        <Search className="text-subtle pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
        <Input
          className="pl-8"
          placeholder="Search username or name…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          aria-label="Search users"
        />
      </div>
      <Card className="overflow-hidden">
        <table className="w-full text-left">
          <thead className="border-line bg-raised/50 text-muted border-b text-[12px]">
            <tr>
              <th className="px-4 py-2 font-medium">User</th>
              <th className="px-2 py-2 font-medium">Status</th>
              <th className="px-2 py-2 font-medium">Activity</th>
              <th className="px-4 py-2 text-right font-medium">Joined</th>
            </tr>
          </thead>
          <tbody className={cn("divide-line divide-y", users.isPlaceholderData && "opacity-60")}>
            {users.isPending &&
              [0, 1, 2, 3, 4].map((i) => (
                <tr key={i}>
                  <td colSpan={4} className="px-4 py-2">
                    <Skeleton className="h-8" />
                  </td>
                </tr>
              ))}
            {users.data?.results.map((u) => (
              <tr
                key={u.id}
                onClick={() => setSelected(u.id)}
                className="hover:bg-hover cursor-pointer"
              >
                <td className="px-4 py-2.5">
                  <p className="font-medium">{u.full_name}</p>
                  <p className="text-muted text-[12px]">@{u.username}</p>
                </td>
                <td className="px-2 py-2.5">
                  <div className="flex gap-1">
                    {u.is_active ? (
                      <Badge tone="green">active</Badge>
                    ) : (
                      <Badge tone="red">disabled</Badge>
                    )}
                    {u.is_staff && <Badge tone="accent">{u.role?.replace("_", " ")}</Badge>}
                  </div>
                </td>
                <td className="text-muted px-2 py-2.5 text-[12.5px]">
                  {u.watch_count} watched · {u.rating_count} rated
                  {u.last_seen ? ` · seen ${new Date(u.last_seen).toLocaleDateString()}` : ""}
                </td>
                <td className="tabular text-muted px-4 py-2.5 text-right text-[12px]">
                  {new Date(u.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.data?.results.length === 0 && (
          <Empty icon={<Users className="size-8" />} title="No users found" />
        )}
        {users.data && users.data.count > 25 && (
          <div className="border-line flex justify-end gap-1 border-t px-4 py-2">
            <Button
              size="sm"
              variant="ghost"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={!users.data.next}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </Card>
      <UserDrawer id={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function UserDrawer({ id, onClose }: { id: number | null; onClose: () => void }) {
  const toast = useToast();
  const { can, user: me } = useAuth();
  const queryClient = useQueryClient();
  const [temp, setTemp] = useState<string | null>(null);
  const detail = useQuery({
    queryKey: ["user", id],
    enabled: id !== null,
    queryFn: () => unwrap(api.GET("/api/v1/admin/users/{id}", { params: { path: { id: id! } } })),
  });
  const act = async (verb: "disable" | "enable" | "reset-password") => {
    if (id === null) return;
    try {
      if (verb === "reset-password") {
        const r = await unwrap(
          api.POST("/api/v1/admin/users/{id}/reset-password", { params: { path: { id } } }),
        );
        setTemp(r.temporary_password);
      } else {
        await unwrap(
          verb === "disable"
            ? api.POST("/api/v1/admin/users/{id}/disable", { params: { path: { id } } })
            : api.POST("/api/v1/admin/users/{id}/enable", { params: { path: { id } } }),
        );
        toast(verb === "disable" ? "Account disabled and signed out" : "Account enabled");
      }
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      void queryClient.invalidateQueries({ queryKey: ["user", id] });
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Action failed", "error");
    }
  };
  const d = detail.data;
  return (
    <Dialog.Root
      open={id !== null}
      onOpenChange={(o) => {
        if (!o) {
          onClose();
          setTemp(null);
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[140] bg-black/30" />
        <Dialog.Content
          aria-describedby={undefined}
          className="border-line bg-panel fixed inset-y-0 right-0 z-[141] w-[min(520px,94vw)] overflow-y-auto border-l shadow-2xl"
        >
          <div className="border-line bg-panel sticky top-0 flex items-center justify-between border-b px-5 py-3">
            <Dialog.Title className="font-semibold">{d ? d.user.full_name : "User"}</Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              className="hover:bg-hover grid size-8 place-items-center rounded-md"
            >
              <X className="size-4" />
            </Dialog.Close>
          </div>
          {!d ? (
            <div className="space-y-3 p-5">
              <Skeleton className="h-16" />
              <Skeleton className="h-40" />
            </div>
          ) : (
            <div className="space-y-5 p-5">
              <div className="text-muted text-[12.5px]">
                @{d.user.username} · joined {new Date(d.user.created_at).toLocaleDateString()} ·
                prefers {d.user.translation_mode || "default"}
              </div>
              {can("content_manager") && d.user.id !== me?.id && (
                <div className="flex flex-wrap gap-2">
                  {d.user.is_active ? (
                    <Button size="sm" variant="danger" onClick={() => void act("disable")}>
                      <Ban className="size-3.5" /> Disable account
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => void act("enable")}>
                      Enable account
                    </Button>
                  )}
                  <Button size="sm" onClick={() => void act("reset-password")}>
                    <KeyRound className="size-3.5" /> Reset password
                  </Button>
                </div>
              )}
              {temp && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-[12.5px]">
                  Temporary password (shown once — share it securely):{" "}
                  <code className="bg-panel ml-1 rounded px-1.5 py-0.5 font-mono text-[13px] select-all">
                    {temp}
                  </code>
                </div>
              )}
              <section>
                <h3 className="text-subtle mb-2 text-[12px] font-medium tracking-wider uppercase">
                  Watch history
                </h3>
                {d.history.length ? (
                  <ul className="space-y-1.5">
                    {d.history.map((h, i) => (
                      <li key={i} className="flex items-center gap-3 text-[13px]">
                        <span className="min-w-0 flex-1 truncate">
                          {h.title}
                          {h.episode ? <span className="text-muted"> · {h.episode}</span> : null}
                        </span>
                        <div className="bg-raised h-1 w-20 overflow-hidden rounded-full">
                          <div
                            className="bg-accent h-full"
                            style={{ width: `${(h.completed ? 1 : h.progress) * 100}%` }}
                          />
                        </div>
                        <span className="text-subtle w-20 text-right text-[11.5px]">
                          {new Date(h.updated_at).toLocaleDateString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted text-[12.5px]">Nothing watched yet.</p>
                )}
              </section>
              <section>
                <h3 className="text-subtle mb-2 text-[12px] font-medium tracking-wider uppercase">
                  Ratings
                </h3>
                {d.ratings.length ? (
                  <ul className="space-y-1.5">
                    {d.ratings.map((r) => (
                      <li key={r.title_id} className="flex items-center gap-2 text-[13px]">
                        {r.value < 0 ? (
                          <ThumbsDown className="size-3.5 text-red-500" />
                        ) : (
                          <ThumbsUp
                            className={cn(
                              "size-3.5",
                              r.value === 2 ? "text-accent" : "text-emerald-500",
                            )}
                          />
                        )}
                        <span className="flex-1 truncate">{r.title}</span>
                        <span className="text-subtle text-[11.5px]">
                          {r.value === 2 ? "Loves it" : r.value === 1 ? "Likes it" : "Not for them"}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted text-[12.5px]">No ratings yet.</p>
                )}
              </section>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

"use client";

import { ApiError, unwrap } from "@netfly/api-client";
import { LazyLogoLoader } from "@netfly/ui";
import * as Dialog from "@radix-ui/react-dialog";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Eye, Film, Pencil, Search, ShieldCheck, X } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { useToast } from "@/components/providers/toast";
import { IconButton, useConfirm } from "@/components/ui/actions";
import {
  Badge,
  Button,
  Card,
  Empty,
  Input,
  Label,
  Select,
  Textarea,
} from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { clock, hostOf, type ApprovedEmbed } from "@/lib/extraction";
import { useDebounced } from "@/lib/use-debounced";
import { PreviewFrame } from "./preview-frame";

/** Embeds saved "for the client". The viewer app doesn't read them yet (decision 72). */
export function ApprovedEmbeds() {
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("approved");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const query = useDebounced(search.trim(), 300);
  const [previewing, setPreviewing] = useState<ApprovedEmbed | null>(null);
  const [editing, setEditing] = useState<ApprovedEmbed | null>(null);
  const embeds = useQuery({
    queryKey: ["extraction", "embeds", status, query, page],
    queryFn: () =>
      unwrap(
        api.GET("/api/v1/admin/extraction/embeds", {
          params: {
            query: {
              status: (status || undefined) as ApprovedEmbed["status"] | undefined,
              search: query || undefined,
              page,
            },
          },
        }),
      ),
    placeholderData: keepPreviousData,
  });
  const pages = embeds.data ? Math.max(1, Math.ceil(embeds.data.count / 25)) : 1;
  const revoke = (embed: ApprovedEmbed) =>
    confirm({
      title: `Revoke “${embed.title}”?`,
      body: "It stays in the list as revoked and will never be shown to viewers.",
      confirmLabel: "Revoke",
      destructive: true,
      success: "Embed revoked",
      action: async () => {
        await unwrap(
          api.POST("/api/v1/admin/extraction/embeds/{id}/revoke", {
            params: { path: { id: embed.id } },
          }),
        );
        await queryClient.invalidateQueries({ queryKey: ["extraction", "embeds"] });
      },
    });

  return (
    <Card className="overflow-hidden">
      <div className="border-line flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <p className="text-muted mr-auto text-[12.5px]">
          Saved for the viewer app.{" "}
          <strong className="text-fg font-medium">Viewers don’t see these yet.</strong>
        </p>
        <div className="relative min-w-40 flex-1 sm:max-w-60">
          <Search
            className="text-subtle pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2"
            aria-hidden
          />
          <Input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search title or URL"
            aria-label="Search approved embeds"
            className="pl-7"
          />
        </div>
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          aria-label="Status"
        >
          <option value="approved">Approved</option>
          <option value="revoked">Revoked</option>
          <option value="">All</option>
        </Select>
      </div>
      {embeds.isPending ? (
        <div className="grid h-48 place-items-center" aria-busy>
          <LazyLogoLoader size="md" label="Loading approved embeds" />
        </div>
      ) : embeds.data?.results.length ? (
        <ul className="divide-line divide-y" aria-label="Approved embeds">
          {embeds.data.results.map((embed) => (
            <li key={embed.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row">
              <div className="bg-raised relative aspect-video w-full shrink-0 overflow-hidden rounded sm:w-40">
                {embed.thumbnail_data ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a server-made data: URI
                  <img src={embed.thumbnail_data} alt="" className="size-full object-cover" />
                ) : (
                  <Film className="text-subtle absolute inset-0 m-auto size-6" aria-hidden />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="min-w-0 truncate font-medium">{embed.title}</h3>
                  <Badge tone={embed.status === "approved" ? "green" : "neutral"}>
                    {embed.status}
                  </Badge>
                  <Badge tone="blue">{embed.embed_type}</Badge>
                </div>
                <p className="text-muted mt-0.5 line-clamp-2 text-[12.5px]">{embed.description}</p>
                <p className="text-muted mt-1 truncate text-[12px]">
                  {[
                    embed.provider || hostOf(embed.original_url),
                    clock(embed.duration),
                    embed.netfly_title ? `Linked to ${embed.netfly_title.title}` : "",
                    `Approved by ${embed.approved_by_name || "—"} ${new Date(embed.approved_at).toLocaleDateString()}`,
                    embed.revoked_at
                      ? `revoked by ${embed.revoked_by_name || "—"} ${new Date(embed.revoked_at).toLocaleDateString()}`
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <p className="text-muted truncate text-[12px]" title={embed.original_url}>
                  {embed.original_url}
                  {embed.job_id && (
                    <>
                      {" · "}
                      <Link
                        href={`/extraction/${embed.job_id}`}
                        className="text-accent underline underline-offset-2"
                      >
                        open the check
                      </Link>
                    </>
                  )}
                </p>
                {embed.rights_note && (
                  <p className="text-muted mt-1 flex gap-1 text-[12px]">
                    <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    {embed.rights_note}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-start gap-1">
                <Button size="sm" onClick={() => setPreviewing(embed)}>
                  <Eye className="size-3.5" aria-hidden /> Preview
                </Button>
                {embed.status === "approved" && (
                  <>
                    <IconButton label={`Edit ${embed.title}`} onClick={() => setEditing(embed)}>
                      <Pencil className="size-3.5" />
                    </IconButton>
                    <Button size="sm" variant="ghost" onClick={() => revoke(embed)}>
                      <Ban className="size-3.5" aria-hidden /> Revoke
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <Empty icon={<ShieldCheck className="size-8" />} title="Nothing approved yet">
          Check a site, open a video and press Confirm embedding.
        </Empty>
      )}
      {pages > 1 && (
        <div className="border-line text-muted flex items-center justify-between border-t px-4 py-2 text-[12.5px]">
          <span>
            Page {page} of {pages}
          </span>
          <div className="flex gap-1">
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
              disabled={!embeds.data?.next}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
      <PreviewDialog embed={previewing} onClose={() => setPreviewing(null)} />
      <EditDialog embed={editing} onClose={() => setEditing(null)} />
    </Card>
  );
}

function PreviewDialog({ embed, onClose }: { embed: ApprovedEmbed | null; onClose: () => void }) {
  return (
    <Dialog.Root open={!!embed} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[150] bg-black/60" />
        <Dialog.Content
          aria-describedby={undefined}
          className="border-line bg-panel fixed top-1/2 left-1/2 z-[151] w-[min(820px,94vw)] -translate-x-1/2 -translate-y-1/2 rounded-xl border p-4 shadow-2xl"
        >
          <div className="mb-3 flex items-center gap-2">
            <Dialog.Title className="min-w-0 flex-1 truncate font-semibold">
              {embed?.title}
            </Dialog.Title>
            <Dialog.Close asChild>
              <IconButton label="Close preview">
                <X className="size-4" />
              </IconButton>
            </Dialog.Close>
          </div>
          {embed && <PreviewFrame target={{ embed: embed.id }} title={embed.title} />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function EditDialog({ embed, onClose }: { embed: ApprovedEmbed | null; onClose: () => void }) {
  return (
    <Dialog.Root open={!!embed} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[150] bg-black/60" />
        <Dialog.Content className="border-line bg-panel fixed top-1/2 left-1/2 z-[151] w-[min(560px,94vw)] -translate-x-1/2 -translate-y-1/2 rounded-xl border shadow-2xl">
          {embed && <EditForm key={embed.id} embed={embed} onDone={onClose} />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function EditForm({ embed, onDone }: { embed: ApprovedEmbed; onDone: () => void }) {
  const ids = useId();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(embed.title);
  const [description, setDescription] = useState(embed.description);
  const [note, setNote] = useState(embed.rights_note);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await unwrap(
        api.PATCH("/api/v1/admin/extraction/embeds/{id}", {
          params: { path: { id: embed.id } },
          body: { title, description, rights_note: note },
        }),
      );
      toast("Saved");
      void queryClient.invalidateQueries({ queryKey: ["extraction", "embeds"] });
      onDone();
    } catch (e) {
      if (e instanceof ApiError && Object.keys(e.fields).length) setErrors(e.fields);
      else toast(e instanceof ApiError ? e.message : "Couldn't save.", "error");
      setBusy(false);
    }
  };
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="border-line border-b px-4 py-3">
        <Dialog.Title className="font-semibold">Edit what viewers will read</Dialog.Title>
        <Dialog.Description className="text-muted text-[12.5px]">
          The embedded video itself can’t change: check the link again to approve another one.
        </Dialog.Description>
      </div>
      <div className="space-y-4 px-4 py-4">
        <div>
          <Label htmlFor={`${ids}-title`}>Title</Label>
          <Input
            id={`${ids}-title`}
            value={title}
            maxLength={300}
            invalid={!!errors.title}
            onChange={(e) => setTitle(e.target.value)}
          />
          {errors.title && (
            <p className="mt-1 text-[12px] text-red-600 dark:text-red-400">{errors.title}</p>
          )}
        </div>
        <div>
          <Label htmlFor={`${ids}-description`}>Description</Label>
          <Textarea
            id={`${ids}-description`}
            rows={4}
            maxLength={5000}
            value={description}
            aria-invalid={!!errors.description}
            onChange={(e) => setDescription(e.target.value)}
          />
          {errors.description && (
            <p className="mt-1 text-[12px] text-red-600 dark:text-red-400">{errors.description}</p>
          )}
        </div>
        <div>
          <Label htmlFor={`${ids}-note`} hint="Optional">
            Rights note
          </Label>
          <Textarea
            id={`${ids}-note`}
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </div>
      <div className="border-line flex gap-2 border-t px-4 py-3">
        <Button type="submit" variant="primary" loading={busy}>
          Save
        </Button>
        <Dialog.Close asChild>
          <Button type="button" variant="ghost">
            Cancel
          </Button>
        </Dialog.Close>
      </div>
    </form>
  );
}

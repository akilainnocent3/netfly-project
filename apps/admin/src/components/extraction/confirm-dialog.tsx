"use client";

import { ApiError, unwrap, type Schemas } from "@netfly/api-client";
import { cn } from "@netfly/ui";
import * as Dialog from "@radix-ui/react-dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Film, Search, ShieldCheck, Tv, X } from "lucide-react";
import { useId, useState } from "react";
import { useToast } from "@/components/providers/toast";
import { IconButton } from "@/components/ui/actions";
import { Badge, Button, Input, Label, Textarea } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { clock, hostOf, titleFromUrl, type CheckResult, type EmbedChoice } from "@/lib/extraction";
import { useDebounced } from "@/lib/use-debounced";

type Brief = Schemas["RelatedBrief"];
const DESCRIPTION_MIN = 10;

/**
 * "Confirm embedding": staff write the title and description viewers will see, may link a NETFLY
 * title, and must confirm the rights (decision 71). The server re-derives the embed from its own
 * check; nothing here can change what gets embedded.
 */
export function ConfirmEmbedDialog({
  open,
  onOpenChange,
  linkId,
  linkUrl,
  result,
  choice,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  linkId: number;
  linkUrl: string;
  result: CheckResult;
  choice: EmbedChoice;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[160] bg-black/50" />
        <Dialog.Content className="border-line bg-panel fixed inset-x-0 bottom-0 z-[161] flex max-h-[94dvh] flex-col overflow-hidden rounded-t-xl border shadow-2xl sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-[min(600px,94vw)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl">
          {open && (
            <Form
              linkId={linkId}
              linkUrl={linkUrl}
              result={result}
              choice={choice}
              onDone={() => onOpenChange(false)}
            />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Form({
  linkId,
  linkUrl,
  result,
  choice,
  onDone,
}: {
  linkId: number;
  linkUrl: string;
  result: CheckResult;
  choice: EmbedChoice;
  onDone: () => void;
}) {
  const ids = useId();
  const toast = useToast();
  const queryClient = useQueryClient();
  const video = choice === "page" ? null : result.videos[choice];
  const suggestedDescription = (video?.description || result.description || "").trim();
  const [title, setTitle] = useState(
    video?.title || result.title || titleFromUrl(video?.url ?? linkUrl) || hostOf(linkUrl),
  );
  const [description, setDescription] = useState("");
  const [netflyTitle, setNetflyTitle] = useState<Brief | null>(null);
  const [rights, setRights] = useState(false);
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const thumbnail = video?.thumbnail_data || result.thumbnail_data || "";
  const embedType = choice === "page" ? "iframe" : (video?.embed?.type ?? "iframe");

  const submit = async () => {
    const problems: Record<string, string> = {};
    if (!title.trim()) problems.title = "Write the title viewers will see.";
    if (description.trim().length < DESCRIPTION_MIN)
      problems.description = `Write a description viewers will see (at least ${DESCRIPTION_MIN} characters).`;
    if (!rights) problems.rights_confirmed = "Confirm the rights before saving.";
    setErrors(problems);
    if (Object.keys(problems).length) {
      const first = ["title", "description", "rights_confirmed"].find((k) => problems[k]);
      document.getElementById(`${ids}-${first}`)?.focus();
      return;
    }
    setBusy(true);
    try {
      await unwrap(
        api.POST("/api/v1/admin/extraction/links/{id}/approve", {
          params: { path: { id: linkId } },
          body: {
            video_index: choice,
            title: title.trim(),
            description: description.trim(),
            netfly_title_id: netflyTitle?.id ?? null,
            rights_confirmed: true,
            note: note.trim(),
          },
        }),
      );
      toast("Saved for the client — not visible to viewers yet");
      void queryClient.invalidateQueries({ queryKey: ["extraction", "embeds"] });
      onDone();
    } catch (e) {
      if (e instanceof ApiError && Object.keys(e.fields).length) setErrors(e.fields);
      else toast(e instanceof ApiError ? e.message : "Couldn't save the embed.", "error");
      setBusy(false);
    }
  };

  return (
    <form
      noValidate
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="border-line flex items-start gap-3 border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          <Dialog.Title className="font-semibold">Confirm embedding</Dialog.Title>
          <Dialog.Description className="text-muted text-[12.5px]">
            Write what viewers will read. The embed is saved for the viewer app, which doesn’t show
            it yet.
          </Dialog.Description>
        </div>
        <Dialog.Close asChild>
          <IconButton label="Close">
            <X className="size-4" />
          </IconButton>
        </Dialog.Close>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <div className="flex gap-3">
          <div className="bg-raised relative aspect-video w-36 shrink-0 overflow-hidden rounded">
            {thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element -- a server-made data: URI
              <img src={thumbnail} alt="" className="size-full object-cover" />
            ) : (
              <Film className="text-subtle absolute inset-0 m-auto size-6" aria-hidden />
            )}
          </div>
          <dl className="text-muted grid grid-cols-[auto_1fr] content-start gap-x-3 gap-y-0.5 text-[12.5px]">
            <dt>Embed</dt>
            <dd className="text-fg">
              <Badge tone="blue">{embedType}</Badge>
            </dd>
            <dt>From</dt>
            <dd className="text-fg truncate">{video?.provider || hostOf(video?.url ?? linkUrl)}</dd>
            {video?.duration ? (
              <>
                <dt>Duration</dt>
                <dd className="text-fg tabular">{clock(video.duration)}</dd>
              </>
            ) : null}
            {video?.height ? (
              <>
                <dt>Size</dt>
                <dd className="text-fg">{video.height}p</dd>
              </>
            ) : null}
          </dl>
        </div>

        <div>
          <Label htmlFor={`${ids}-title`} hint="Required">
            Title
          </Label>
          <Input
            id={`${ids}-title`}
            value={title}
            maxLength={300}
            invalid={!!errors.title}
            aria-describedby={errors.title ? `${ids}-title-error` : undefined}
            onChange={(e) => setTitle(e.target.value)}
          />
          {errors.title && <FieldError id={`${ids}-title-error`}>{errors.title}</FieldError>}
        </div>

        <div>
          <Label htmlFor={`${ids}-description`} hint="Required">
            Description
          </Label>
          <Textarea
            id={`${ids}-description`}
            rows={4}
            maxLength={5000}
            value={description}
            aria-invalid={!!errors.description}
            aria-describedby={`${ids}-description-help`}
            placeholder="What is this video? Viewers will read this."
            className={cn(errors.description && "border-red-500")}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div id={`${ids}-description-help`} className="mt-1 text-[12px]">
            {errors.description ? (
              <FieldError>{errors.description}</FieldError>
            ) : suggestedDescription && !description ? (
              <p className="text-muted">
                The site describes it as: “{suggestedDescription.slice(0, 160)}
                {suggestedDescription.length > 160 ? "…" : ""}”{" "}
                <button
                  type="button"
                  className="text-accent font-medium underline-offset-2 hover:underline"
                  onClick={() => setDescription(suggestedDescription.slice(0, 5000))}
                >
                  Start from this
                </button>
              </p>
            ) : (
              <p className="text-muted">At least {DESCRIPTION_MIN} characters.</p>
            )}
          </div>
        </div>

        <TitlePicker value={netflyTitle} onChange={setNetflyTitle} />

        <div>
          <label
            className={cn(
              "flex items-start gap-2.5 rounded-lg border p-3 text-[13px]",
              errors.rights_confirmed ? "border-red-500" : "border-line",
            )}
          >
            <input
              id={`${ids}-rights_confirmed`}
              type="checkbox"
              required
              checked={rights}
              onChange={(e) => setRights(e.target.checked)}
              aria-invalid={!!errors.rights_confirmed}
              className="accent-accent mt-0.5 size-4 shrink-0"
            />
            <span>
              I confirm NETFLY has the rights to show this video, or its owner permits embedding.
            </span>
          </label>
          {errors.rights_confirmed && <FieldError>{errors.rights_confirmed}</FieldError>}
        </div>

        <div>
          <Label htmlFor={`${ids}-note`} hint="Optional">
            Note
          </Label>
          <Textarea
            id={`${ids}-note`}
            rows={2}
            maxLength={2000}
            value={note}
            placeholder="e.g. where the permission came from"
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </div>

      <div className="border-line flex flex-wrap items-center gap-2 border-t px-4 py-3">
        <Button type="submit" variant="primary" loading={busy}>
          <ShieldCheck className="size-4" aria-hidden /> Confirm embedding
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

function FieldError({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <p id={id} className="mt-1 text-[12px] text-red-600 dark:text-red-400">
      {children}
    </p>
  );
}

/** Optional: link the embed to a NETFLY title (the same picker endpoint as related titles). */
function TitlePicker({
  value,
  onChange,
}: {
  value: Brief | null;
  onChange: (t: Brief | null) => void;
}) {
  const ids = useId();
  const [q, setQ] = useState("");
  const query = useDebounced(q.trim(), 250);
  const results = useQuery({
    queryKey: ["title-picker", query],
    enabled: !value,
    queryFn: () =>
      unwrap(api.GET("/api/v1/admin/title-picker", { params: { query: { q: query } } })),
    staleTime: 30_000,
  });
  if (value) {
    const Icon = value.type === "series" ? Tv : Film;
    return (
      <div>
        <p className="mb-1.5 text-[12.5px] font-medium">NETFLY title</p>
        <div className="border-line flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px]">
          <Icon className="text-subtle size-4" aria-hidden />
          <span className="min-w-0 flex-1 truncate">
            {value.title} {value.year ? `(${value.year})` : ""}
          </span>
          <IconButton label={`Unlink ${value.title}`} size="sm" onClick={() => onChange(null)}>
            <X className="size-3.5" />
          </IconButton>
        </div>
      </div>
    );
  }
  const options = (results.data ?? []).slice(0, 6);
  return (
    <div>
      <Label htmlFor={`${ids}-q`} hint="Optional">
        NETFLY title
      </Label>
      <div className="relative">
        <Search
          className="text-subtle pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2"
          aria-hidden
        />
        <Input
          id={`${ids}-q`}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search titles to associate"
          className="pl-7"
          aria-controls={`${ids}-list`}
        />
      </div>
      {q.trim() && (
        <ul
          id={`${ids}-list`}
          aria-label="Matching titles"
          className="border-line mt-1 divide-y rounded-lg border"
        >
          {options.length ? (
            options.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  className="hover:bg-hover focus-visible:bg-hover w-full truncate px-3 py-2 text-left text-[13px] outline-none"
                  onClick={() => onChange(t)}
                >
                  {t.title}{" "}
                  <span className="text-muted">
                    {t.year ? `· ${t.year}` : ""} · {t.type}
                  </span>
                </button>
              </li>
            ))
          ) : (
            <li className="text-muted px-3 py-2 text-[12.5px]">
              {results.isFetching ? "Searching…" : "No titles match."}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

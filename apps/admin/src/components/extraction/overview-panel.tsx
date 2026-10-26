"use client";

import { ApiError, unwrap } from "@netfly/api-client";
import { cn, formatBytes, LazyLogoLoader } from "@netfly/ui";
import * as Dialog from "@radix-ui/react-dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CircleAlert,
  CircleCheck,
  CircleHelp,
  CircleX,
  ExternalLink,
  Film,
  RotateCcw,
  ShieldCheck,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/providers/toast";
import { IconButton } from "@/components/ui/actions";
import { Badge, Button } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import {
  KIND_LABEL,
  KIND_TONE,
  VERDICT_LABEL,
  VERDICT_TONE,
  VIDEO_KIND_LABEL,
  approvable,
  clock,
  hostOf,
  type CheckResult,
  type CheckedVideo,
  type EmbedChoice,
  type ExtractionLink,
  type Verdict,
} from "@/lib/extraction";
import { ConfirmEmbedDialog } from "./confirm-dialog";
import { PreviewFrame } from "./preview-frame";

const VERDICT_ICON = { yes: CircleCheck, no: CircleX, unknown: CircleHelp };

/** The "Overview" side panel: checks the link (automatically), explains, previews, approves. */
export function OverviewPanel({
  link,
  onClose,
}: {
  link: ExtractionLink | null;
  onClose: () => void;
}) {
  return (
    <Dialog.Root open={!!link} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[150] bg-black/50" />
        <Dialog.Content
          aria-describedby={undefined}
          className="border-line bg-panel fixed inset-y-0 right-0 z-[151] flex w-full flex-col border-l shadow-2xl outline-none sm:w-[min(640px,92vw)]"
        >
          {link && <Overview key={link.id} link={link} />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Overview({ link }: { link: ExtractionLink }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const detail = useQuery({
    queryKey: ["extraction", "link", link.id],
    queryFn: () =>
      unwrap(api.GET("/api/v1/admin/extraction/links/{id}", { params: { path: { id: link.id } } })),
    refetchInterval: (q) => (q.state.data?.check_status === "checking" ? 1000 : false),
  });
  const data = detail.data;
  const result = (
    data?.check_status === "checked" ? data.check_result : null
  ) as CheckResult | null;

  const startCheck = async (force: boolean) => {
    try {
      const next = await unwrap(
        api.POST("/api/v1/admin/extraction/links/{id}/check", {
          params: { path: { id: link.id } },
          body: { force },
        }),
      );
      queryClient.setQueryData(["extraction", "link", link.id], next);
      void queryClient.invalidateQueries({ queryKey: ["extraction", "links"] });
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Couldn't check this link.", "error");
    }
  };
  // Opening a link checks it — once per opening, never in a loop.
  const asked = useRef(false);
  useEffect(() => {
    if (data && data.check_status === "unchecked" && !asked.current) {
      asked.current = true;
      void startCheck(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.check_status]);
  // Refresh the table row once a check finishes.
  const status = data?.check_status;
  useEffect(() => {
    if (status === "checked" || status === "failed") {
      void queryClient.invalidateQueries({ queryKey: ["extraction", "links"] });
    }
  }, [status, queryClient]);

  const [choice, setChoice] = useState<EmbedChoice | null>(null);
  useEffect(() => {
    if (result) setChoice(approvable(result) ?? (result.recommended as EmbedChoice | null) ?? null);
  }, [result]);
  const [confirming, setConfirming] = useState(false);
  const chosenVerdict: Verdict | null =
    result && choice !== null
      ? choice === "page"
        ? (result.page_embeddable.verdict as Verdict)
        : ((result.videos[choice]?.playable_in_netfly.verdict as Verdict) ?? null)
      : null;
  const checking = !data || data.check_status === "checking" || data.check_status === "unchecked";

  return (
    <>
      <div className="border-line flex items-start gap-3 border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          <Dialog.Title className="truncate font-semibold">
            {result?.title || link.title || hostOf(link.url)}
          </Dialog.Title>
          <p className="text-muted flex items-center gap-1.5 text-[12.5px]">
            <Badge tone={KIND_TONE[link.kind]}>{KIND_LABEL[link.kind]}</Badge>
            <a
              href={link.url}
              target="_blank"
              rel="noreferrer noopener"
              className="hover:text-fg inline-flex min-w-0 items-center gap-1 truncate underline-offset-2 hover:underline"
            >
              <span className="truncate">{link.url}</span>
              <ExternalLink className="size-3 shrink-0" aria-hidden />
              <span className="sr-only">(opens the site in a new tab)</span>
            </a>
          </p>
        </div>
        <Dialog.Close asChild>
          <IconButton label="Close overview">
            <X className="size-4" />
          </IconButton>
        </Dialog.Close>
      </div>

      <div
        className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4"
        aria-busy={checking || undefined}
      >
        <div role="status" aria-live="polite" className="sr-only">
          {checking
            ? "Checking this link…"
            : data?.check_status === "failed"
              ? "The check failed."
              : result
                ? `Check finished. ${result.videos.length} video${result.videos.length === 1 ? "" : "s"} found.`
                : ""}
        </div>
        {checking ? (
          <div className="grid place-items-center gap-3 py-16 text-center">
            <LazyLogoLoader size="lg" decorative delay={0} />
            <p className="font-medium">Checking this link…</p>
            <p className="text-muted max-w-xs text-[12.5px]">
              Fetching the page, reading its headers and looking for videos. This usually takes a
              few seconds.
            </p>
          </div>
        ) : data?.check_status === "failed" ? (
          <p className="flex items-center gap-2 rounded-md bg-red-500/10 px-3 py-2 text-[13px] text-red-600 dark:text-red-400">
            <CircleAlert className="size-4 shrink-0" aria-hidden />
            {(data.check_result as { error?: string } | null)?.error ??
              "The check failed. Try again."}
          </p>
        ) : result ? (
          <Results result={result} choice={choice} onChoose={setChoice} linkId={link.id} />
        ) : null}
      </div>

      <div className="border-line bg-panel flex flex-wrap items-center gap-2 border-t px-4 py-3">
        <Button
          variant="primary"
          disabled={chosenVerdict !== "yes"}
          onClick={() => setConfirming(true)}
          aria-describedby="confirm-help"
        >
          <ShieldCheck className="size-4" aria-hidden /> Confirm embedding
        </Button>
        <Button variant="secondary" disabled={checking} onClick={() => startCheck(true)}>
          <RotateCcw className="size-3.5" aria-hidden /> Recheck
        </Button>
        <p id="confirm-help" className="text-muted min-w-0 flex-1 text-[12px]">
          {checking
            ? ""
            : chosenVerdict === "yes"
              ? "Saves the chosen video for the viewer app. Viewers won’t see it yet."
              : "Only a video (or page) with a “Yes” verdict can be approved."}
        </p>
      </div>
      {result && choice !== null && chosenVerdict === "yes" && (
        <ConfirmEmbedDialog
          open={confirming}
          onOpenChange={setConfirming}
          linkId={link.id}
          linkUrl={link.url}
          result={result}
          choice={choice}
        />
      )}
    </>
  );
}

function Results({
  result,
  choice,
  onChoose,
  linkId,
}: {
  result: CheckResult;
  choice: EmbedChoice | null;
  onChoose: (choice: EmbedChoice) => void;
  linkId: number;
}) {
  const page = result.page_embeddable;
  const isPage = result.link_kind === "page";
  return (
    <>
      <dl className="text-muted grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[12.5px]">
        <dt>Status</dt>
        <dd className="text-fg truncate">
          {result.http_status ?? "no answer"} {result.content_type && `· ${result.content_type}`}
        </dd>
        {result.redirects.length > 0 && (
          <>
            <dt>Redirects</dt>
            <dd className="text-fg truncate" title={result.final_url}>
              {result.redirects.length} → {result.final_url}
            </dd>
          </>
        )}
      </dl>

      <VerdictCard
        title={isPage ? "Page embeddable" : "Page"}
        verdict={page.verdict as Verdict}
        reasons={page.reasons}
        notes={page.notes ?? []}
        chosen={choice === "page"}
        onChoose={page.verdict === "yes" ? () => onChoose("page") : undefined}
        chooseLabel="Embed the page itself"
      />

      <section aria-labelledby={`videos-${linkId}`}>
        <h3 id={`videos-${linkId}`} className="mb-2 flex items-center gap-2 font-semibold">
          <Film className="text-subtle size-4" aria-hidden />
          Videos found{" "}
          <span className="text-muted text-[12.5px] font-normal">{result.videos.length}</span>
        </h3>
        {result.videos.length ? (
          <ul className="space-y-2">
            {result.videos.map((video, index) => (
              <li key={`${video.url}-${index}`}>
                <VideoCard
                  video={video}
                  chosen={choice === index}
                  recommended={result.recommended === index}
                  onChoose={() => onChoose(index)}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted text-[13px]">
            No video on this page that NETFLY recognises (files, HLS/DASH streams, or players from
            known providers or with an oEmbed endpoint).
          </p>
        )}
      </section>

      {choice !== null && (
        <section aria-labelledby={`preview-${linkId}`}>
          <h3 id={`preview-${linkId}`} className="mb-2 font-semibold">
            Live preview
          </h3>
          <PreviewFrame
            target={{ link: linkId, choice, version: result.checked_at }}
            title={
              choice === "page"
                ? result.title || result.final_url
                : result.videos[choice]?.title || "Video"
            }
          />
        </section>
      )}
    </>
  );
}

function VerdictCard({
  title,
  verdict,
  reasons,
  notes,
  chosen,
  onChoose,
  chooseLabel,
}: {
  title: string;
  verdict: Verdict;
  reasons: string[];
  notes: string[];
  chosen: boolean;
  onChoose?: () => void;
  chooseLabel: string;
}) {
  const Icon = VERDICT_ICON[verdict];
  return (
    <section
      className={cn(
        "rounded-lg border p-3",
        chosen ? "border-accent ring-accent/30 ring-2" : "border-line",
      )}
    >
      <div className="flex items-center gap-2">
        <Icon
          className={cn(
            "size-4",
            verdict === "yes"
              ? "text-emerald-500"
              : verdict === "no"
                ? "text-red-500"
                : "text-amber-500",
          )}
          aria-hidden
        />
        <h3 className="font-semibold">{title}</h3>
        <Badge tone={VERDICT_TONE[verdict]}>{VERDICT_LABEL[verdict]}</Badge>
        {onChoose && (
          <Button
            size="sm"
            variant={chosen ? "secondary" : "ghost"}
            className="ml-auto"
            onClick={onChoose}
            aria-pressed={chosen}
          >
            {chosen ? "Chosen" : chooseLabel}
          </Button>
        )}
      </div>
      <ul className="mt-1.5 space-y-0.5 text-[13px]">
        {reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      {notes.length > 0 && (
        <ul className="text-muted mt-1.5 space-y-0.5 text-[12px]">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function VideoCard({
  video,
  chosen,
  recommended,
  onChoose,
}: {
  video: CheckedVideo;
  chosen: boolean;
  recommended: boolean;
  onChoose: () => void;
}) {
  const verdict = video.playable_in_netfly.verdict as Verdict;
  const Icon = VERDICT_ICON[verdict];
  const facts = [
    VIDEO_KIND_LABEL[video.kind] ?? video.kind,
    video.provider,
    video.height ? `${video.height}p` : video.width ? `${video.width}px wide` : "",
    clock(video.duration),
    video.size ? formatBytes(video.size) : "",
  ].filter(Boolean);
  return (
    <div
      className={cn(
        "flex gap-3 rounded-lg border p-3",
        chosen ? "border-accent ring-accent/30 ring-2" : "border-line",
      )}
    >
      <div className="bg-raised relative aspect-video w-28 shrink-0 overflow-hidden rounded">
        {video.thumbnail_data ? (
          // eslint-disable-next-line @next/next/no-img-element -- a server-made data: URI
          <img src={video.thumbnail_data} alt="" className="size-full object-cover" />
        ) : (
          <Film className="text-subtle absolute inset-0 m-auto size-6" aria-hidden />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Icon
            className={cn(
              "size-4 shrink-0",
              verdict === "yes"
                ? "text-emerald-500"
                : verdict === "no"
                  ? "text-red-500"
                  : "text-amber-500",
            )}
            aria-hidden
          />
          <p className="min-w-0 flex-1 truncate font-medium">{video.title || video.url}</p>
          <Badge tone={VERDICT_TONE[verdict]}>Plays in NETFLY: {VERDICT_LABEL[verdict]}</Badge>
        </div>
        <p className="text-muted truncate text-[12px]">{facts.join(" · ")}</p>
        <ul className="mt-1 space-y-0.5 text-[12.5px]">
          {video.playable_in_netfly.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <div className="mt-2 flex items-center gap-2">
          <Button
            size="sm"
            variant={chosen ? "secondary" : "ghost"}
            onClick={onChoose}
            aria-pressed={chosen}
          >
            {chosen ? "Previewing" : "Preview this"}
          </Button>
          {recommended && <Badge tone="accent">Recommended</Badge>}
        </div>
      </div>
    </div>
  );
}

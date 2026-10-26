"use client";

import { unwrap } from "@netfly/api-client";
import { LazyLogoLoader } from "@netfly/ui";
import { useQuery } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { api } from "@/lib/api";
import type { EmbedChoice } from "@/lib/extraction";

type Target = { link: number; choice: EmbedChoice; version?: string | null } | { embed: number };

/**
 * The live preview, from Studio's dedicated route `/extraction/preview/…` whose CSP alone allows
 * the embed's origins (decision 69). The server's verdict is the answer; this only confirms it
 * visually (decision 68): browsers don't tell a page why a frame refused to load.
 */
export function PreviewFrame({ target, title }: { target: Target; title: string }) {
  const key =
    "link" in target
      ? ["link", target.link, target.choice, target.version]
      : ["embed", target.embed];
  const token = useQuery({
    queryKey: ["extraction", "preview-token", ...key],
    staleTime: 10 * 60_000,
    queryFn: () =>
      "link" in target
        ? unwrap(
            api.GET("/api/v1/admin/extraction/links/{id}/preview-token", {
              params: { path: { id: target.link }, query: { video: String(target.choice) } },
            }),
          )
        : unwrap(
            api.GET("/api/v1/admin/extraction/embeds/{id}/preview-token", {
              params: { path: { id: target.embed } },
            }),
          ),
  });
  const ref = "link" in target ? `link-${target.link}` : `embed-${target.embed}`;
  return (
    <div>
      <div className="relative aspect-video overflow-hidden rounded-lg bg-black">
        {token.data ? (
          <iframe
            key={token.data.token}
            src={`/extraction/preview/${ref}?t=${encodeURIComponent(token.data.token)}`}
            title={`Preview: ${title}`}
            className="absolute inset-0 size-full border-0"
            sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
            allow="autoplay; fullscreen; picture-in-picture"
            referrerPolicy="strict-origin-when-cross-origin"
            loading="lazy"
          />
        ) : token.isError ? (
          <p className="absolute inset-0 grid place-items-center p-4 text-center text-[13px] text-white/80">
            The preview isn’t available for this item.
          </p>
        ) : (
          <div className="absolute inset-0 grid place-items-center text-white">
            <LazyLogoLoader size="md" label="Loading the preview" />
          </div>
        )}
      </div>
      <p className="text-muted mt-2 flex gap-1.5 text-[12px]">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>
          If the preview stays blank or shows an error, the site may refuse to be framed — browsers
          don’t report why to the page. The verdict above comes from the site’s own headers and is
          what counts; the preview is only a visual confirmation.
        </span>
      </p>
    </div>
  );
}

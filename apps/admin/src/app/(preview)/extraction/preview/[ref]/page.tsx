import type { Metadata } from "next";
import { PreviewPlayer } from "./preview-player";

const API = process.env.NETFLY_API_URL ?? "http://localhost:8000";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Preview", robots: { index: false } };

type Preview = {
  title: string;
  embed: { type: "iframe" | "oembed" | "hls" | "mp4" | "dash"; src: string; html?: string };
  verdict: "yes" | "no" | "unknown";
  reasons: string[];
};

/**
 * Studio's preview route (decision 69), framed by the Overview panel. The middleware gives this
 * route — and only this route — a CSP that admits the origins the API recorded for this one check.
 * The embed is rendered from its URL; the provider's HTML is never put in the DOM.
 */
export default async function ExtractionPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t = "" } = await searchParams;
  let preview: Preview | null = null;
  let problem = "This preview link has expired. Open it again from Studio.";
  try {
    const res = await fetch(
      `${API}/api/v1/admin/extraction/preview?token=${encodeURIComponent(t)}`,
      { cache: "no-store" },
    );
    if (res.ok) preview = (await res.json()) as Preview;
    else problem = ((await res.json()) as { message?: string }).message ?? problem;
  } catch {
    problem = "Studio couldn't reach the API to load this preview.";
  }
  return (
    <main className="fixed inset-0 grid place-items-center bg-black text-white">
      {!preview ? (
        <p className="max-w-sm p-6 text-center text-[13px] text-white/80">{problem}</p>
      ) : preview.embed.type === "iframe" || preview.embed.type === "oembed" ? (
        <iframe
          src={preview.embed.src}
          title={preview.title || "Embedded video"}
          className="absolute inset-0 size-full border-0"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
          allow="autoplay; fullscreen; picture-in-picture"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      ) : preview.embed.type === "dash" ? (
        <p className="max-w-sm p-6 text-center text-[13px] text-white/80">
          DASH streams can’t be previewed yet: NETFLY’s player plays HLS and MP4.
        </p>
      ) : (
        <PreviewPlayer kind={preview.embed.type} src={preview.embed.src} title={preview.title} />
      )}
    </main>
  );
}

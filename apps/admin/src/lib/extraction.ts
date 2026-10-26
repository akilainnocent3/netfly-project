import type { Schemas } from "@netfly/api-client";

export type ExtractionJob = Schemas["ExtractionJob"];
export type ExtractionJobDetail = Schemas["ExtractionJobDetail"];
export type ExtractionLink = Schemas["ExtractionLink"];
export type ExtractionLinkDetail = Schemas["ExtractionLinkDetail"];
export type CheckResult = Schemas["CheckResult"];
export type CheckedVideo = Schemas["CheckedVideo"];
export type ApprovedEmbed = Schemas["ApprovedEmbed"];
export type Verdict = "yes" | "no" | "unknown";
/** What a staff member approves: a video of the check (its index) or the page itself. */
export type EmbedChoice = number | "page";

export const ACTIVE_JOB = ["queued", "crawling"];

export const KIND_LABEL: Record<string, string> = {
  page: "Page",
  video_file: "Video file",
  stream: "Stream",
  embed: "Embed",
  image: "Image",
  document: "Document",
  other: "Other",
};

export const KIND_TONE = {
  page: "neutral",
  video_file: "accent",
  stream: "accent",
  embed: "blue",
  image: "neutral",
  document: "neutral",
  other: "neutral",
} as const;

export const SOURCE_LABEL: Record<string, string> = {
  start: "Start URL",
  a_href: "Link",
  link: "<link>",
  iframe: "Frame",
  video_src: "<video>",
  source_src: "<source>",
  img: "Image",
  srcset: "srcset",
  og_video: "Open Graph",
  json_ld: "Structured data",
  sitemap: "Sitemap",
  script: "Script",
  oembed: "oEmbed",
  redirect: "Redirect",
  rendered: "Rendered page",
};

export const VERDICT_LABEL: Record<Verdict, string> = { yes: "Yes", no: "No", unknown: "Unknown" };
export const VERDICT_TONE = { yes: "green", no: "red", unknown: "amber" } as const;

export const VIDEO_KIND_LABEL: Record<string, string> = {
  file: "Video file",
  hls: "HLS stream",
  dash: "DASH stream",
  provider_embed: "Player",
};

/**
 * Live validation for the start form (the server re-checks everything, decision 67).
 * Returns the problem, or a suggestion when the scheme is missing — never a silent rewrite.
 */
export function checkStartUrl(raw: string): { error?: string; suggestion?: string } {
  const value = raw.trim();
  if (!value) return {};
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) && !/^https?:\/\//i.test(value)) {
    return { error: "Only http:// and https:// addresses can be checked." };
  }
  if (!/^https?:\/\//i.test(value)) {
    const candidate = `https://${value.replace(/^\/+/, "")}`;
    return isHttpUrl(candidate)
      ? { error: "Add http:// or https://.", suggestion: candidate }
      : { error: "That isn't a valid web address." };
  }
  return isHttpUrl(value) ? {} : { error: "That isn't a valid web address." };
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && !!url.hostname.includes(".");
  } catch {
    return false;
  }
}

export function clock(seconds?: number | null): string {
  if (!seconds && seconds !== 0) return "";
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

/** "my-film_trailer.mp4" → "My film trailer": a starting point for a file's title. */
export function titleFromUrl(url: string): string {
  try {
    const last = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "");
    const name = last
      .replace(/\.[a-z0-9]{2,5}$/i, "")
      .replace(/[-_.]+/g, " ")
      .trim();
    return name ? name[0]!.toUpperCase() + name.slice(1) : "";
  } catch {
    return "";
  }
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** The thing a check recommends, if it may be approved (a "yes" verdict). */
export function approvable(result: CheckResult | null | undefined): EmbedChoice | null {
  if (!result) return null;
  const rec = result.recommended as unknown;
  if (rec === "page") return result.page_embeddable.verdict === "yes" ? "page" : null;
  if (typeof rec === "number") {
    return result.videos[rec]?.playable_in_netfly.verdict === "yes" ? rec : null;
  }
  return null;
}

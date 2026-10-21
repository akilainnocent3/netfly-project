import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HomeFeed } from "@/components/browse/home-feed";
import { PublicShell } from "@/components/public/public-shell";
import { describeTitle, PublicTitle } from "@/components/public/public-title";
import { TitleModal } from "@/components/title/title-modal";
import { getPublicConfig } from "@/lib/server-config";
import { imageUrl, isSignedIn, publicEpisodes, publicTitle, siteUrl } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const [page, config] = await Promise.all([publicTitle(slug), getPublicConfig()]);
  if (!page) return { title: "Title not found", robots: { index: false } };
  const t = page.title;
  const site = await siteUrl(config);
  const url = `${site}/title/${t.slug}`;
  const description = describeTitle(t);
  const image = imageUrl(site, t.backdrop?.key, 1280);
  const heading = `Watch ${t.title}${t.year ? ` (${t.year})` : ""}`;
  return {
    title: heading,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: t.type === "series" ? "video.tv_show" : "video.movie",
      url,
      title: heading,
      description,
      images: image ? [{ url: image, width: 1280, height: 720, alt: t.title }] : undefined,
    },
    twitter: { card: "summary_large_image", title: heading, description, images: image },
  };
}

/**
 * Signed in: the title opens as a modal over the home feed (deep link).
 * Signed out: a server-rendered public page (real content + JSON-LD) that search engines index.
 */
export default async function TitlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (await isSignedIn()) {
    return (
      <>
        <HomeFeed />
        <TitleModal slug={slug} fallbackHref="/browse" />
      </>
    );
  }
  const [page, config] = await Promise.all([publicTitle(slug), getPublicConfig()]);
  if (!page) notFound();
  const season = page.title.seasons[0]?.number;
  const [episodes, site] = await Promise.all([
    season != null ? publicEpisodes(slug, season) : Promise.resolve(null),
    siteUrl(config),
  ]);
  return (
    <PublicShell next={`/title/${slug}`} overlay>
      <PublicTitle page={page} episodes={episodes} site={site} />
    </PublicShell>
  );
}

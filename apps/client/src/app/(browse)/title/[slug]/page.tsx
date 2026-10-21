import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HomeFeed } from "@/components/browse/home-feed";
import { describeTitle, TitleStructuredData } from "@/components/public/title-structured-data";
import { TitleModal } from "@/components/title/title-modal";
import { getPublicConfig } from "@/lib/server-config";
import { imageUrl, isSignedIn, publicEpisodes, publicTitle, siteUrl } from "@/lib/seo";
import { serverMode } from "@/lib/server-mode";

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
 * Deep link: the title opens as the same modal over the home feed for everyone. It is rendered
 * in place with server data, so the HTML carries the full title (plus JSON-LD) for crawlers;
 * signed-in viewers fetch their personal state (resume, My List, rating) client-side.
 */
export default async function TitlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const mode = await serverMode();
  const [page, config, signedIn] = await Promise.all([
    publicTitle(slug, mode),
    getPublicConfig(),
    isSignedIn(),
  ]);
  if (!page) notFound();
  const season = page.title.seasons[0]?.number;
  const [episodes, site] = await Promise.all([
    season != null ? publicEpisodes(slug, season) : Promise.resolve(null),
    siteUrl(config),
  ]);
  return (
    <>
      <TitleStructuredData page={page} episodes={episodes} site={site} />
      <HomeFeed />
      <TitleModal
        slug={slug}
        fallbackHref="/browse"
        inline
        initial={signedIn ? undefined : { mode, data: page }}
      />
    </>
  );
}

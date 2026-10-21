import type { Schemas } from "@netfly/api-client";
import { imageUrl, JsonLd } from "@/lib/seo";
import type { TitlePage } from "@/lib/types";

/** Search/social description: the short synopsis, else the synopsis cut at a word boundary. */
export function describeTitle(t: TitlePage["title"]): string {
  const text = (t.short_synopsis || t.synopsis || "").trim();
  if (text.length <= 160) return text;
  return `${text.slice(0, 157).replace(/\s+\S*$/, "")}…`;
}

/**
 * Structured data for a title page (Movie / TVSeries + breadcrumbs). The page itself is the
 * normal app UI, server-rendered; crawlers read the same content viewers see.
 */
export function TitleStructuredData({
  page,
  episodes,
  site,
}: {
  page: TitlePage;
  episodes: Schemas["EpisodePage"] | null;
  site: string;
}) {
  const t = page.title;
  const url = `${site}/title/${t.slug}`;
  const series = t.type === "series";
  const genre = t.genres_full[0];
  const people = (names: string[] | undefined) =>
    (names ?? []).map((name) => ({ "@type": "Person", name }));
  const ld = {
    "@context": "https://schema.org",
    "@type": series ? "TVSeries" : "Movie",
    "@id": url,
    url,
    name: t.title,
    ...(t.original_title && t.original_title !== t.title
      ? { alternateName: t.original_title }
      : {}),
    description: t.synopsis || t.short_synopsis,
    image: imageUrl(site, t.poster?.key ?? t.backdrop?.key, 960),
    genre: t.genres_full.map((g) => g.name),
    ...(t.year ? { datePublished: String(t.year) } : {}),
    ...(t.maturity_rating ? { contentRating: t.maturity_rating } : {}),
    ...(t.language ? { inLanguage: t.language } : {}),
    ...(t.cast?.length ? { actor: people(t.cast) } : {}),
    ...(t.directors?.length ? { director: people(t.directors) } : {}),
    ...(series
      ? {
          numberOfSeasons: t.season_count ?? undefined,
          ...(episodes?.results.length
            ? {
                containsSeason: {
                  "@type": "TVSeason",
                  seasonNumber: episodes.season.number,
                  numberOfEpisodes: episodes.season.episode_count,
                  episode: episodes.results.map((e) => ({
                    "@type": "TVEpisode",
                    episodeNumber: e.number,
                    name: e.name,
                    ...(e.synopsis ? { description: e.synopsis } : {}),
                  })),
                },
              }
            : {}),
        }
      : t.runtime_minutes
        ? { duration: `PT${t.runtime_minutes}M` }
        : {}),
    potentialAction: { "@type": "WatchAction", target: url },
  };
  const crumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${site}/` },
      ...(genre
        ? [
            {
              "@type": "ListItem",
              position: 2,
              name: genre.name,
              item: `${site}/genre/${genre.slug}`,
            },
          ]
        : []),
      { "@type": "ListItem", position: genre ? 3 : 2, name: t.title, item: url },
    ],
  };

  return (
    <>
      <JsonLd data={ld} />
      <JsonLd data={crumbs} />
    </>
  );
}

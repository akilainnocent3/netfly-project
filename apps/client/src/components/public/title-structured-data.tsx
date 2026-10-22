import type { Schemas } from "@netfly/api-client";
import { clip, imageUrl, JsonLd } from "@/lib/seo";
import type { TitlePage } from "@/lib/types";

/**
 * Search/social description (~155 characters, cut at a word boundary): the synopsis, else
 * `seo.default_description`. A short one is followed by the facts people search for.
 */
export function describeTitle(t: TitlePage["title"], fallback = ""): string {
  const text = (t.synopsis || t.short_synopsis || fallback).replace(/\s+/g, " ").trim();
  const facts = [
    t.year ? String(t.year) : "",
    t.genres_full.map((g) => g.name).join(", "),
    t.cast?.length ? `Starring ${t.cast.slice(0, 2).join(", ")}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  if (text.length >= 90 || !facts) return clip(text || t.title, 155);
  return clip(`${text ? `${text.replace(/\.?$/, ".")} ` : `${t.title}: `}${facts}.`, 155);
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
    description: t.synopsis || t.short_synopsis || undefined,
    image: imageUrl(site, t.poster?.key ?? t.backdrop?.key, 960),
    genre: t.genres_full.map((g) => g.name),
    ...(t.year ? { dateCreated: String(t.year), datePublished: String(t.year) } : {}),
    ...(t.maturity_rating ? { contentRating: t.maturity_rating } : {}),
    // No aggregateRating: viewers rate with thumbs, not star reviews (Google's review rules).
    ...(t.language ? { inLanguage: t.language } : {}),
    ...(t.cast?.length ? { actor: people(t.cast) } : {}),
    ...(t.directors?.length ? { director: people(t.directors) } : {}),
    ...(series
      ? {
          numberOfSeasons: t.season_count ?? (t.seasons.length || undefined),
          // Every season the page lists; the first one with its episodes.
          ...(t.seasons.length
            ? {
                containsSeason: t.seasons.map((season) => ({
                  "@type": "TVSeason",
                  seasonNumber: season.number,
                  numberOfEpisodes: season.episode_count,
                  ...(episodes?.season.number === season.number && episodes.results.length
                    ? {
                        episode: episodes.results.map((e) => ({
                          "@type": "TVEpisode",
                          episodeNumber: e.number,
                          name: e.name,
                          ...(e.synopsis ? { description: e.synopsis } : {}),
                        })),
                      }
                    : {}),
                })),
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

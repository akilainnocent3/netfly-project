import Link from "next/link";
import type { Schemas } from "@netfly/api-client";
import { Play } from "lucide-react";
import { imageUrl, JsonLd } from "@/lib/seo";
import type { TitlePage } from "@/lib/types";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { NetflyImage } from "../ui/netfly-image";
import { PublicPoster } from "./public-shell";

export function runtimeLabel(minutes: number | null | undefined): string | null {
  if (!minutes) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

/** Search/social description: the short synopsis, else the synopsis cut at a word boundary. */
export function describeTitle(t: TitlePage["title"]): string {
  const text = (t.short_synopsis || t.synopsis || "").trim();
  if (text.length <= 160) return text;
  return `${text.slice(0, 157).replace(/\s+\S*$/, "")}…`;
}

/** Signed-out, server-rendered title page: what search engines index and social cards link to. */
export function PublicTitle({
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
  const join = `/signup?next=${encodeURIComponent(`/title/${t.slug}`)}`;
  const series = t.type === "series";
  const genre = t.genres_full[0];
  const length = series
    ? t.season_count
      ? `${t.season_count} Season${t.season_count === 1 ? "" : "s"}`
      : null
    : runtimeLabel(t.runtime_minutes);
  const meta = [t.year, length, t.quality].filter(Boolean);

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
    <article>
      <JsonLd data={ld} />
      <JsonLd data={crumbs} />
      <section className="relative isolate flex min-h-[78svh] items-end overflow-hidden pt-28 pb-12 md:min-h-[86vh] md:pb-20">
        <div className="absolute inset-0 -z-10">
          <NetflyImage
            image={t.backdrop}
            alt=""
            sizes="100vw"
            priority
            className="object-cover object-[70%_center]"
          />
          <div className="absolute inset-0 bg-[linear-gradient(77deg,rgb(0_0_0/0.85)_0%,rgb(0_0_0/0.55)_45%,transparent_80%)]" />
          <div className="from-bg absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t to-transparent" />
        </div>
        <div className="w-full px-[max(4vw,16px)]">
          <div className="max-w-2xl">
            <nav aria-label="Breadcrumb" className="text-meta text-muted mb-4">
              <ol className="flex flex-wrap items-center gap-1.5">
                <li>
                  <Link href="/" className="hover:text-white">
                    Home
                  </Link>
                </li>
                {genre ? (
                  <li className="flex items-center gap-1.5">
                    <span aria-hidden>›</span>
                    <a href={`/genre/${genre.slug}`} className="hover:text-white">
                      {genre.name}
                    </a>
                  </li>
                ) : null}
                <li className="flex items-center gap-1.5">
                  <span aria-hidden>›</span>
                  <span aria-current="page" className="text-white/80">
                    {t.title}
                  </span>
                </li>
              </ol>
            </nav>
            <h1 className="text-title font-black tracking-tight text-balance">{t.title}</h1>
            <div className="text-body text-muted mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
              {meta.map((m) => (
                <span key={String(m)}>{m}</span>
              ))}
              {t.maturity_rating ? (
                <span className="border-subtle text-meta rounded-sm border px-1.5 text-white">
                  {t.maturity_rating}
                </span>
              ) : null}
              {t.top10_rank ? <Badge kind="top10" rank={t.top10_rank} /> : null}
            </div>
            <p className="text-lead mt-5 max-w-xl text-white/90">
              {t.synopsis || t.short_synopsis}
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button asChild variant="accent" size="lg" icon={<Play className="fill-current" />}>
                <a href={join}>Join to watch</a>
              </Button>
              <Button asChild variant="secondary" size="lg">
                <a href={`/login?next=${encodeURIComponent(`/title/${t.slug}`)}`}>Sign In</a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <div className="space-y-14 px-[max(4vw,16px)] pb-16">
        {series && episodes?.results.length ? (
          <section aria-labelledby="episodes">
            <h2 id="episodes" className="text-h2 mb-1 font-bold">
              Episodes
            </h2>
            <p className="text-meta text-muted mb-5">{episodes.season.display_name}</p>
            <ol className="divide-line max-w-4xl divide-y">
              {episodes.results.map((e) => (
                <li key={e.id} className="flex gap-4 py-4">
                  <span className="text-h2 text-subtle w-8 shrink-0 text-center font-bold">
                    {e.number}
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-body flex flex-wrap items-baseline gap-x-3 font-bold">
                      {e.name}
                      {e.runtime_minutes ? (
                        <span className="text-meta text-muted font-normal">
                          {runtimeLabel(e.runtime_minutes)}
                        </span>
                      ) : null}
                    </h3>
                    {e.synopsis ? <p className="text-meta text-muted mt-1">{e.synopsis}</p> : null}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {page.more_like_this.length ? (
          <section aria-labelledby="more-like-this">
            <h2 id="more-like-this" className="text-h2 mb-5 font-bold">
              More Like This
            </h2>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {page.more_like_this.map((m) => (
                <li key={m.id}>
                  <PublicPoster href={`/title/${m.slug}`} title={m.title} image={m.poster} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section aria-labelledby="about" className="max-w-4xl">
          <h2 id="about" className="text-h2 mb-5 font-bold">
            About {t.title}
          </h2>
          <dl className="text-body grid gap-3 sm:grid-cols-[10rem_1fr]">
            {t.directors?.length ? (
              <>
                <dt className="text-muted">Director{t.directors.length > 1 ? "s" : ""}</dt>
                <dd>{t.directors.join(", ")}</dd>
              </>
            ) : null}
            {t.cast?.length ? (
              <>
                <dt className="text-muted">Cast</dt>
                <dd>{t.cast.join(", ")}</dd>
              </>
            ) : null}
            {t.genres_full.length ? (
              <>
                <dt className="text-muted">Genres</dt>
                <dd>
                  {t.genres_full.map((g, i) => (
                    <span key={g.slug}>
                      {i > 0 ? ", " : ""}
                      <a href={`/genre/${g.slug}`} className="hover:underline">
                        {g.name}
                      </a>
                    </span>
                  ))}
                </dd>
              </>
            ) : null}
            {t.moods.length ? (
              <>
                <dt className="text-muted">This {series ? "series" : "film"} is</dt>
                <dd>{t.moods.join(", ")}</dd>
              </>
            ) : null}
            {t.maturity_rating ? (
              <>
                <dt className="text-muted">Maturity rating</dt>
                <dd>{t.maturity_rating}</dd>
              </>
            ) : null}
            {t.translator_name ? (
              <>
                <dt className="text-muted">Translated by</dt>
                <dd>{t.translator_name}</dd>
              </>
            ) : null}
          </dl>
        </section>
      </div>
    </article>
  );
}

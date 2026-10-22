"use client";

import { cn, formatRuntime, LazyLogoLoader } from "@netfly/ui";
import { Play, RotateCcw, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { useTitlePage } from "@/lib/queries";
import { getPlayback, warmManifest } from "@/lib/playback";
import type { TitleCard, TitlePage } from "@/lib/types";
import { CardArt } from "../browse/card";
import { PlayLink } from "../auth/auth-gate";
import { MyListButton } from "../browse/my-list-button";
import { PreviewVideo } from "../browse/preview-video";
import { RatingButton } from "../browse/rating-button";
import { StateMessage } from "../ui/state-message";
import { NetflyImage } from "../ui/netfly-image";
import { Badge } from "../ui/badge";
import { Button, IconButton } from "../ui/button";
import { Episodes } from "./episodes";

export function TitleView({
  slug,
  onClose,
  scrollParent,
  initial,
  asPage = false,
}: {
  slug: string;
  onClose: () => void;
  scrollParent: React.RefObject<HTMLElement | null>;
  /** Server-fetched data: the deep-link page renders the full content in its HTML. */
  initial?: { mode: string; data: TitlePage };
  /** The title is the page's main heading (deep link), not a dialog over another page. */
  asPage?: boolean;
}) {
  const page = useTitlePage(slug, initial);

  // Opening a title warms its manifest so Play starts instantly.
  useEffect(() => {
    const play = page.data?.viewer?.play;
    if (play) void getPlayback(slug, { episode: play.episode_id }).then(warmManifest);
  }, [page.data?.viewer?.play, slug]);

  if (page.isPending) return <TitleSkeleton onClose={onClose} />;
  if (page.isError || !page.data) {
    return (
      <div className="relative">
        <CloseButton onClose={onClose} />
        <StateMessage
          tone="error"
          title="This title isn't available"
          action={{ label: "Go back", onClick: onClose }}
        >
          It may have left the catalog, or the link is wrong.
        </StateMessage>
      </div>
    );
  }
  return (
    <TitleContent data={page.data} onClose={onClose} scrollParent={scrollParent} asPage={asPage} />
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <IconButton
      variant="ghost"
      size="lg"
      label="Close"
      onClick={onClose}
      className="bg-bg/80 hover:bg-bg absolute top-4 right-4 z-30 backdrop-blur"
    >
      <X />
    </IconButton>
  );
}

function TitleContent({
  data,
  onClose,
  scrollParent,
  asPage,
}: {
  data: TitlePage;
  onClose: () => void;
  scrollParent: React.RefObject<HTMLElement | null>;
  asPage: boolean;
}) {
  const Heading = asPage ? "h1" : "h2";
  const { title, viewer, more_like_this } = data;
  const play = viewer?.play;
  const card: TitleCard = title;
  const meta =
    title.type === "series"
      ? title.seasons.length
        ? `${title.seasons.length} Season${title.seasons.length === 1 ? "" : "s"}`
        : ""
      : formatRuntime(title.runtime_minutes);
  const top = useRef<HTMLDivElement>(null);
  // Braces matter: scrollIntoView returns a Promise in current Chrome, and an effect that returns a
  // non-function crashes React when the modal unmounts.
  useEffect(() => {
    top.current?.scrollIntoView({ block: "start" });
  }, [title.slug]);

  return (
    <article ref={top} aria-labelledby="title-heading">
      <div className="relative aspect-video max-h-[62vh] w-full overflow-hidden md:rounded-t-xl">
        <NetflyImage
          image={title.backdrop}
          alt=""
          sizes="(min-width: 900px) 900px, 100vw"
          priority
          className="object-cover"
          fallback={<CardArt title={card} sizes="900px" showText={false} />}
        />
        {title.has_preview && (
          <PreviewVideo
            title={card}
            showMute
            delayMs={600}
            controlsClassName="absolute right-[5%] bottom-[10%] z-20"
            loaderClassName="absolute right-[calc(5%+12px)] bottom-[calc(10%+12px)] z-20"
          />
        )}
        <div className="from-surface via-surface/20 absolute inset-0 bg-gradient-to-t to-transparent" />
        <CloseButton onClose={onClose} />
        <div className="absolute right-[5%] bottom-[8%] left-[5%] z-10">
          {title.logo ? (
            <div className="relative mb-5 h-[clamp(56px,11vw,120px)] w-[min(420px,70%)]">
              <NetflyImage
                image={title.logo}
                alt={title.title}
                sizes="420px"
                className="object-contain object-left-bottom drop-shadow-[0_4px_20px_rgb(0_0_0/0.6)]"
              />
            </div>
          ) : null}
          <Heading
            id="title-heading"
            className={cn(
              "text-shadow leading-[0.95] font-black tracking-tight uppercase",
              title.logo ? "sr-only" : "text-title mb-5",
            )}
          >
            {title.title}
          </Heading>
          <div className="flex flex-wrap items-center gap-2.5">
            {play ? (
              <Button
                asChild
                variant="play"
                size="lg"
                icon={play.action === "resume" ? <RotateCcw /> : <Play className="fill-current" />}
              >
                <PlayLink slug={title.slug} episode={play.episode_id} titleName={title.title}>
                  {play.label}
                </PlayLink>
              </Button>
            ) : (
              <Button variant="secondary" size="lg" disabled>
                Coming soon
              </Button>
            )}
            {viewer && <MyListButton title={card} size="lg" initial={viewer.in_my_list} />}
            {viewer && (
              <RatingButton
                title={{ ...card, rating: viewer.rating }}
                size="lg"
                onDisliked={onClose}
              />
            )}
          </div>
          {play && play.progress > 0 && <ResumeBar play={play} runtime={title.runtime_minutes} />}
        </div>
      </div>

      <div className="grid gap-8 px-[5%] pt-6 pb-12 md:grid-cols-[1.8fr_1fr]">
        <div>
          <div className="text-body flex flex-wrap items-center gap-2.5">
            {typeof title.match === "number" && (
              <span className="text-match font-bold">{title.match}% Match</span>
            )}
            {title.year && <span className="text-white/80">{title.year}</span>}
            {meta && <span className="text-white/80">{meta}</span>}
            {title.maturity_rating && (
              <span className="text-meta rounded border border-white/40 px-1.5 leading-5 font-medium">
                {title.maturity_rating}
              </span>
            )}
            {title.quality && (
              <span className="text-caption rounded border border-white/30 px-1 leading-4 font-semibold text-white/70">
                {title.quality}
              </span>
            )}
          </div>
          {title.top10_rank ? (
            <p className="text-lead mt-3 flex items-center gap-2 font-bold">
              <Badge kind="top10" rank={title.top10_rank} />#{title.top10_rank} in{" "}
              {title.type === "series" ? "Series" : "Films"} Today
            </p>
          ) : null}
          <div className="mt-3">
            {title.translation_status === "translated" ? (
              <span className="bg-accent/15 ring-accent/40 text-meta inline-flex items-center gap-2 rounded-full px-3 py-1 font-semibold text-white ring-1">
                <span className="bg-accent size-1.5 rounded-full" /> Translated
                {title.translator_name ? ` by ${title.translator_name}` : ""}
              </span>
            ) : (
              <span className="text-meta inline-flex items-center gap-2 rounded-full bg-white/8 px-3 py-1 font-semibold text-white/85 ring-1 ring-white/15">
                Original language
              </span>
            )}
          </div>
          <p className="text-body mt-5 leading-relaxed text-white/90">
            {title.synopsis || title.short_synopsis}
          </p>
        </div>
        <dl className="text-body space-y-3">
          {(title.cast ?? []).length > 0 && (
            <Meta label="Cast" value={(title.cast ?? []).join(", ")} />
          )}
          {title.genres_full.length > 0 && (
            <Meta label="Genres" value={title.genres_full.map((g) => g.name).join(", ")} />
          )}
          {(title.directors ?? []).length > 0 && (
            <Meta
              label={title.type === "series" ? "Creators" : "Director"}
              value={(title.directors ?? []).join(", ")}
            />
          )}
          {title.moods.length > 0 && (
            <Meta
              label={`This ${title.type === "series" ? "show" : "film"} is`}
              value={title.moods.join(", ")}
            />
          )}
          {title.original_title && title.original_title !== title.title && (
            <Meta label="Original title" value={title.original_title} />
          )}
        </dl>
      </div>

      {title.type === "series" && (
        <div className="px-[5%]">
          <Episodes
            title={title}
            preferredSeason={viewer?.last_season ?? play?.season_number ?? null}
            scrollParent={scrollParent}
          />
        </div>
      )}

      {more_like_this.length > 0 && (
        <section aria-labelledby="more-heading" className="px-[5%] pt-10 pb-14">
          <h3 id="more-heading" className="text-h3 mb-5 font-bold">
            More Like This
          </h3>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {more_like_this.map((t) => (
              <li key={t.id} className="bg-elevated overflow-hidden rounded-lg">
                <Link
                  href={`/title/${t.slug}`}
                  scroll={false}
                  replace
                  className="relative block aspect-video"
                >
                  <CardArt title={t} sizes="300px" />
                </Link>
                <div className="space-y-2 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-meta flex flex-wrap items-center gap-1.5 text-white/75">
                      {typeof t.match === "number" && (
                        <span className="text-match font-bold">{t.match}%</span>
                      )}
                      {t.maturity_rating && (
                        <span className="rounded border border-white/35 px-1 leading-4">
                          {t.maturity_rating}
                        </span>
                      )}
                      {t.year && <span>{t.year}</span>}
                    </div>
                    <MyListButton title={t} />
                  </div>
                  <p className="text-meta line-clamp-3 leading-snug text-white/65">
                    {t.short_synopsis}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <About title={title} />
    </article>
  );
}

/** "23 of 48m": how far in, out of the full running time. */
function ResumeBar({
  play,
  runtime,
}: {
  play: NonNullable<NonNullable<TitlePage["viewer"]>["play"]>;
  runtime?: number | null;
}) {
  const total =
    play.progress > 0 && play.position > 0
      ? Math.round(play.position / play.progress / 60)
      : (runtime ?? 0);
  const done = Math.max(1, Math.round(play.position / 60));
  return (
    <div
      className="text-meta mt-3 flex max-w-sm items-center gap-3 text-white/80"
      data-testid="resume-bar"
    >
      <div className="h-[3px] flex-1 bg-white/25">
        <div className="bg-accent h-full" style={{ width: `${play.progress * 100}%` }} />
      </div>
      <span className="whitespace-nowrap">
        {total ? `${Math.min(done, total)} of ${total}m` : "In progress"}
      </span>
    </div>
  );
}

function About({ title }: { title: TitlePage["title"] }) {
  const people = (label: string, list?: string[] | null) =>
    list && list.length > 0 ? <Meta label={label} value={list.join(", ")} /> : null;
  return (
    <section aria-labelledby="about-heading" className="px-[5%] pb-14">
      <h3 id="about-heading" className="text-h3 mb-4 font-normal">
        About <strong className="font-bold">{title.title}</strong>
      </h3>
      <dl className="text-meta space-y-2">
        {people(title.type === "series" ? "Creators" : "Director", title.directors)}
        {people("Cast", title.cast)}
        {people(
          "Genres",
          title.genres_full.map((g) => g.name),
        )}
        {title.moods.length > 0 &&
          people(`This ${title.type === "series" ? "show" : "film"} is`, title.moods)}
        {title.maturity_rating && (
          <div className="flex items-center gap-2">
            <dt className="text-white/50">Maturity rating:</dt>
            <dd>
              <span className="rounded border border-white/40 px-1.5 leading-5 font-medium">
                {title.maturity_rating}
              </span>
            </dd>
          </div>
        )}
        {title.translation_status === "translated" && title.translator_name && (
          <Meta label="Translated by" value={title.translator_name} />
        )}
      </dl>
    </section>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="inline text-white/50">{label}: </dt>
      <dd className="inline text-white/90">{value}</dd>
    </div>
  );
}

function TitleSkeleton({ onClose }: { onClose: () => void }) {
  return (
    <div aria-busy className="relative">
      <CloseButton onClose={onClose} />
      <div className="relative grid aspect-video max-h-[62vh] w-full place-items-center">
        <div aria-hidden className="skeleton absolute inset-0 md:rounded-t-xl" />
        <LazyLogoLoader size="md" />
      </div>
      <div aria-hidden className="space-y-3 px-[5%] py-8">
        <div className="skeleton h-5 w-56 rounded" />
        <div className="skeleton h-4 w-full rounded" />
        <div className="skeleton h-4 w-4/5 rounded" />
      </div>
    </div>
  );
}

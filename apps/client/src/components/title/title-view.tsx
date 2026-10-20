"use client";

import { cn, formatRuntime } from "@netfly/ui";
import { Play, RotateCcw, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { useTitlePage } from "@/lib/queries";
import { getPlayback, warmManifest } from "@/lib/playback";
import type { TitleCard, TitlePage } from "@/lib/types";
import { CardArt } from "../browse/card";
import { MyListButton } from "../browse/my-list-button";
import { PreviewVideo } from "../browse/preview-video";
import { RatingButton } from "../browse/rating-button";
import { StateMessage } from "../ui/state-message";
import { NetflyImage } from "../ui/netfly-image";
import { Episodes } from "./episodes";

export function TitleView({
  slug,
  onClose,
  scrollParent,
}: {
  slug: string;
  onClose: () => void;
  scrollParent: React.RefObject<HTMLElement | null>;
}) {
  const page = useTitlePage(slug);

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
  return <TitleContent data={page.data} onClose={onClose} scrollParent={scrollParent} />;
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close"
      className="bg-bg/80 hover:bg-bg absolute top-4 right-4 z-30 grid size-10 place-items-center rounded-full text-white backdrop-blur"
    >
      <X className="size-5" />
    </button>
  );
}

function TitleContent({
  data,
  onClose,
  scrollParent,
}: {
  data: TitlePage;
  onClose: () => void;
  scrollParent: React.RefObject<HTMLElement | null>;
}) {
  const { title, viewer, more_like_this } = data;
  const play = viewer?.play;
  const card: TitleCard = title;
  const playHref = play?.episode_id
    ? `/watch/${title.slug}?episode=${play.episode_id}`
    : `/watch/${title.slug}`;
  const meta =
    title.type === "series"
      ? title.seasons.length
        ? `${title.seasons.length} Season${title.seasons.length === 1 ? "" : "s"}`
        : ""
      : formatRuntime(title.runtime_minutes);
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => top.current?.scrollIntoView({ block: "start" }), [title.slug]);

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
        {title.has_preview && <PreviewVideo title={card} showMute />}
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
          <h2
            id="title-heading"
            className={cn(
              "text-shadow leading-[0.95] font-black tracking-tight uppercase",
              title.logo ? "sr-only" : "mb-5 text-[clamp(30px,5vw,56px)]",
            )}
          >
            {title.title}
          </h2>
          <div className="flex flex-wrap items-center gap-2.5">
            {play ? (
              <Link
                href={playHref}
                className="flex h-11 items-center gap-2.5 rounded-md bg-white px-6 text-[17px] font-bold text-black transition hover:bg-white/85"
              >
                {play.action === "resume" ? (
                  <RotateCcw className="size-5" />
                ) : (
                  <Play className="size-5 fill-current" />
                )}
                {play.label}
              </Link>
            ) : (
              <span className="flex h-11 items-center rounded-md bg-white/15 px-5 text-[15px] font-semibold text-white/70">
                Coming soon
              </span>
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
          {play && play.progress > 0 && (
            <div className="mt-3 flex max-w-xs items-center gap-3 text-[13px] text-white/75">
              <div className="h-1 flex-1 rounded-full bg-white/25">
                <div
                  className="bg-accent h-full rounded-full"
                  style={{ width: `${play.progress * 100}%` }}
                />
              </div>
              {title.type === "movie" && title.runtime_minutes
                ? `${Math.max(1, Math.round((1 - play.progress) * title.runtime_minutes))}m left`
                : "In progress"}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-8 px-[5%] pt-6 pb-12 md:grid-cols-[1.8fr_1fr]">
        <div>
          <div className="flex flex-wrap items-center gap-2.5 text-[15px]">
            {typeof title.match === "number" && (
              <span className="font-bold text-emerald-400">{title.match}% match</span>
            )}
            {title.year && <span className="text-white/80">{title.year}</span>}
            {meta && <span className="text-white/80">{meta}</span>}
            {title.maturity_rating && (
              <span className="rounded border border-white/40 px-1.5 text-[12px] leading-5 font-medium">
                {title.maturity_rating}
              </span>
            )}
            <span className="rounded border border-white/30 px-1 text-[11px] leading-4 font-semibold text-white/70">
              HD
            </span>
          </div>
          <div className="mt-3">
            {title.translation_status === "translated" ? (
              <span className="bg-accent/15 ring-accent/40 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[13px] font-semibold text-white ring-1">
                <span className="bg-accent size-1.5 rounded-full" /> Translated
                {title.translator_name ? ` by ${title.translator_name}` : ""}
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-full bg-white/8 px-3 py-1 text-[13px] font-semibold text-white/85 ring-1 ring-white/15">
                Original language
              </span>
            )}
          </div>
          <p className="mt-5 text-[16px] leading-relaxed text-white/90">
            {title.synopsis || title.short_synopsis}
          </p>
        </div>
        <dl className="space-y-3 text-[14px]">
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
          <h3 id="more-heading" className="mb-5 text-[22px] font-bold">
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
                    <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-white/75">
                      {typeof t.match === "number" && (
                        <span className="font-bold text-emerald-400">{t.match}%</span>
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
                  <p className="line-clamp-3 text-[13px] leading-snug text-white/65">
                    {t.short_synopsis}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
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
    <div aria-hidden className="relative">
      <CloseButton onClose={onClose} />
      <div className="skeleton aspect-video max-h-[62vh] w-full md:rounded-t-xl" />
      <div className="space-y-3 px-[5%] py-8">
        <div className="skeleton h-5 w-56 rounded" />
        <div className="skeleton h-4 w-full rounded" />
        <div className="skeleton h-4 w-4/5 rounded" />
      </div>
    </div>
  );
}

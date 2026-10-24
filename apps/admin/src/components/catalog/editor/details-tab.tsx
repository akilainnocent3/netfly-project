"use client";

import { unwrap } from "@netfly/api-client";
import { cn } from "@netfly/ui";
import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useConfig } from "@/components/providers/config";
import { Card, Input, Label, Select, Textarea } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import type { TitleDetail } from "@/lib/types";
import { TagInput } from "./tag-input";

export type DetailsPatch = Partial<
  Pick<
    TitleDetail,
    | "title"
    | "original_title"
    | "slug"
    | "year"
    | "runtime_minutes"
    | "language"
    | "maturity_rating"
    | "translation_status"
    | "translator_name"
    | "short_synopsis"
    | "synopsis"
    | "cast"
    | "directors"
    | "moods"
    | "genre_ids"
  >
>;

export function DetailsTab({
  draft,
  onChange,
  errors,
  readOnly,
}: {
  draft: TitleDetail;
  onChange: (patch: DetailsPatch) => void;
  errors: Record<string, string>;
  readOnly: boolean;
}) {
  const config = useConfig();
  const genres = useQuery({
    queryKey: ["genres"],
    queryFn: () => unwrap(api.GET("/api/v1/admin/genres")),
  });
  const ratings = config.list("content.maturity_ratings");
  const err = (key: string) =>
    errors[key] && <p className="mt-1 text-[12px] text-red-500">{errors[key]}</p>;
  const selectedGenres = new Set(draft.genre_ids ?? draft.genres.map((g) => g.id));

  return (
    <fieldset disabled={readOnly} className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Card className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="t-title">Title</Label>
            <Input
              id="t-title"
              value={draft.title}
              invalid={!!errors.title}
              onChange={(e) => onChange({ title: e.target.value })}
            />
            {err("title")}
          </div>
          <div>
            <Label htmlFor="t-original">Original title</Label>
            <Input
              id="t-original"
              value={draft.original_title ?? ""}
              onChange={(e) => onChange({ original_title: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="t-slug" hint="URL">
              Slug
            </Label>
            <Input
              id="t-slug"
              value={draft.slug ?? ""}
              invalid={!!errors.slug}
              onChange={(e) =>
                onChange({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })
              }
            />
            {err("slug")}
          </div>
        </div>
        <div>
          <Label
            htmlFor="t-short"
            hint={`${(draft.short_synopsis ?? "").length}/300 · cards & hero`}
          >
            Short synopsis
          </Label>
          <Textarea
            id="t-short"
            rows={2}
            maxLength={300}
            value={draft.short_synopsis ?? ""}
            onChange={(e) => onChange({ short_synopsis: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="t-synopsis">Synopsis</Label>
          <Textarea
            id="t-synopsis"
            rows={6}
            value={draft.synopsis ?? ""}
            onChange={(e) => onChange({ synopsis: e.target.value })}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="t-cast">Cast</Label>
            <TagInput
              id="t-cast"
              value={draft.cast ?? []}
              onChange={(cast) => onChange({ cast })}
              placeholder="Type a name, press Enter"
            />
          </div>
          <div>
            <Label htmlFor="t-directors">Directors</Label>
            <TagInput
              id="t-directors"
              value={draft.directors ?? []}
              onChange={(directors) => onChange({ directors })}
              placeholder="Type a name, press Enter"
            />
          </div>
        </div>
        <div>
          <Label htmlFor="t-moods" hint="“This title is…” — up to 3; empty uses the genres">
            Moods
          </Label>
          <TagInput
            id="t-moods"
            value={draft.moods ?? []}
            onChange={(moods) => onChange({ moods: moods.slice(0, 3) })}
            placeholder="e.g. Suspenseful, Witty"
          />
        </div>
      </Card>

      <div className="space-y-4">
        <GenrePicker
          genres={genres.data ?? []}
          loading={genres.isPending}
          selected={selectedGenres}
          onChange={(ids) => onChange({ genre_ids: ids })}
        />
        <Card className="space-y-4 p-5">
          <div>
            <Label>Translation</Label>
            <div className="bg-raised grid grid-cols-2 gap-1 rounded-md p-1">
              {(["translated", "not_translated"] as const).map((value) => (
                <button
                  type="button"
                  key={value}
                  onClick={() => onChange({ translation_status: value })}
                  className={cn(
                    "h-7 rounded text-[12.5px] font-medium",
                    draft.translation_status === value ? "bg-panel shadow-sm" : "text-muted",
                  )}
                >
                  {value === "translated" ? "Translated" : "Not translated"}
                </button>
              ))}
            </div>
          </div>
          {draft.translation_status === "translated" && (
            <div>
              <Label htmlFor="t-translator" hint="Shown on the title">
                Translator / DJ
              </Label>
              <Input
                id="t-translator"
                value={draft.translator_name ?? ""}
                onChange={(e) => onChange({ translator_name: e.target.value })}
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="t-year">Year</Label>
              <Input
                id="t-year"
                type="number"
                inputMode="numeric"
                value={draft.year ?? ""}
                invalid={!!errors.year}
                onChange={(e) => onChange({ year: e.target.value ? Number(e.target.value) : null })}
              />
              {err("year")}
            </div>
            {draft.type === "movie" && (
              <div>
                <Label htmlFor="t-runtime" hint="min">
                  Runtime
                </Label>
                <Input
                  id="t-runtime"
                  type="number"
                  inputMode="numeric"
                  value={draft.runtime_minutes ?? ""}
                  onChange={(e) =>
                    onChange({ runtime_minutes: e.target.value ? Number(e.target.value) : null })
                  }
                />
              </div>
            )}
            <div>
              <Label htmlFor="t-rating">Maturity</Label>
              <Select
                id="t-rating"
                className="w-full"
                value={draft.maturity_rating ?? ""}
                onChange={(e) => onChange({ maturity_rating: e.target.value })}
              >
                <option value="">—</option>
                {ratings.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
              {err("maturity_rating")}
            </div>
            <div>
              <Label htmlFor="t-lang">Language</Label>
              <Input
                id="t-lang"
                placeholder="en"
                value={draft.language ?? ""}
                onChange={(e) => onChange({ language: e.target.value })}
              />
            </div>
          </div>
        </Card>
      </div>
    </fieldset>
  );
}

/** “Categories (genres)”: chosen ones first as removable chips, then a searchable list. */
function GenrePicker({
  genres,
  loading,
  selected,
  onChange,
}: {
  genres: { id: number; name: string }[];
  loading: boolean;
  selected: Set<number>;
  onChange: (ids: number[]) => void;
}) {
  const [q, setQ] = useState("");
  const chosen = genres.filter((g) => selected.has(g.id));
  const needle = q.trim().toLowerCase();
  const options = genres.filter(
    (g) => !selected.has(g.id) && (!needle || g.name.toLowerCase().includes(needle)),
  );
  const toggle = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  };
  return (
    <Card className="p-5">
      <section aria-labelledby="t-genres-label">
        <p id="t-genres-label" className="text-[13px] font-semibold">
          Categories (genres)
        </p>
        <p className="text-muted mt-0.5 mb-3 text-[12.5px]">
          Where viewers find this title: its category pages and genre rows. You can also add titles
          from{" "}
          <Link href="/categories" className="text-fg underline underline-offset-2">
            Categories
          </Link>
          .
        </p>
        <div className="mb-3 flex min-h-7 flex-wrap gap-1.5" aria-label="Selected categories">
          {chosen.length ? (
            chosen.map((g) => (
              <span
                key={g.id}
                className="border-accent bg-accent text-accent-fg inline-flex h-7 items-center gap-1 rounded-full border pr-1 pl-3 text-[12.5px]"
              >
                {g.name}
                <button
                  type="button"
                  onClick={() => toggle(g.id)}
                  aria-label={`Remove ${g.name}`}
                  className="grid size-5 place-items-center rounded-full hover:bg-black/20"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))
          ) : (
            <span className="text-subtle self-center text-[12.5px]">
              None yet — this title won&rsquo;t appear in any category.
            </span>
          )}
        </div>
        <div className="relative mb-2">
          <Search className="text-subtle pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && options[0]) {
                e.preventDefault();
                toggle(options[0].id);
                setQ("");
              }
            }}
            placeholder="Search categories…"
            aria-label="Search categories"
            className="pl-8"
          />
        </div>
        <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
          {options.map((g) => (
            <button
              type="button"
              key={g.id}
              aria-pressed={false}
              onClick={() => toggle(g.id)}
              className="border-line hover:bg-hover h-7 rounded-full border px-3 text-[12.5px] transition-colors"
            >
              + {g.name}
            </button>
          ))}
          {!loading && genres.length === 0 && (
            <p className="text-muted text-[12.5px]">Create categories under Categories first.</p>
          )}
          {!loading && genres.length > 0 && !options.length && needle && (
            <p className="text-muted text-[12.5px]">No category matches “{q}”.</p>
          )}
        </div>
      </section>
    </Card>
  );
}

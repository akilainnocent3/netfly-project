"use client";

import { unwrap } from "@netfly/api-client";
import { cn } from "@netfly/ui";
import { useQuery } from "@tanstack/react-query";
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
      </Card>

      <div className="space-y-4">
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
        <Card className="p-5">
          <Label>Genres</Label>
          <div className="flex flex-wrap gap-1.5">
            {genres.data?.map((g) => {
              const on = selectedGenres.has(g.id);
              return (
                <button
                  type="button"
                  key={g.id}
                  aria-pressed={on}
                  onClick={() => {
                    const next = new Set(selectedGenres);
                    if (on) next.delete(g.id);
                    else next.add(g.id);
                    onChange({ genre_ids: [...next] });
                  }}
                  className={cn(
                    "h-7 rounded-full border px-3 text-[12.5px] transition-colors",
                    on ? "border-accent bg-accent text-accent-fg" : "border-line hover:bg-hover",
                  )}
                >
                  {g.name}
                </button>
              );
            })}
            {genres.data?.length === 0 && (
              <p className="text-muted text-[12.5px]">Create genres under Categories first.</p>
            )}
          </div>
        </Card>
      </div>
    </fieldset>
  );
}

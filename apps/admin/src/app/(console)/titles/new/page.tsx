"use client";

import { ApiError, unwrap } from "@netfly/api-client";
import { cn } from "@netfly/ui";
import { Clapperboard, Tv } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/providers/toast";
import { Button, Card, Input, Label, PageHeader } from "@/components/ui/primitives";
import { api } from "@/lib/api";

export default function NewTitlePage() {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [type, setType] = useState<"movie" | "series">("movie");
  const [translation, setTranslation] = useState<"translated" | "not_translated">("translated");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const create = async () => {
    if (!name.trim()) return setError("Give the title a name.");
    setBusy(true);
    try {
      const title = await unwrap(
        api.POST("/api/v1/admin/titles", {
          body: { title: name.trim(), type, translation_status: translation },
        }),
      );
      toast("Draft created");
      router.replace(`/titles/${title.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't create the title.");
      setBusy(false);
    }
  };

  // Creating is a deliberate action (it makes a record), so this form submits on Enter or the button
  // rather than auto-submitting while typing.
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title="New title"
        description="Start with the basics — everything else autosaves in the editor."
      />
      <Card className="p-5">
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <div>
            <Label htmlFor="name">Title</Label>
            <Input
              id="name"
              autoFocus
              value={name}
              invalid={!!error}
              onChange={(e) => {
                setName(e.target.value);
                setError("");
              }}
              placeholder="e.g. The Long Night"
            />
            {error && <p className="mt-1.5 text-[12.5px] text-red-500">{error}</p>}
          </div>
          <div>
            <Label>Type</Label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["movie", "Movie", Clapperboard],
                  ["series", "Series", Tv],
                ] as const
              ).map(([value, label, Icon]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setType(value)}
                  aria-pressed={type === value}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg border p-3 text-left transition-colors",
                    type === value ? "border-accent bg-accent/5" : "border-line hover:bg-hover",
                  )}
                >
                  <Icon className={cn("size-4", type === value ? "text-accent" : "text-subtle")} />
                  <span className="font-medium">{label}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>Translation</Label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["translated", "Translated"],
                  ["not_translated", "Not translated"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTranslation(value)}
                  aria-pressed={translation === value}
                  className={cn(
                    "rounded-lg border p-3 text-left font-medium transition-colors",
                    translation === value
                      ? "border-accent bg-accent/5"
                      : "border-line hover:bg-hover",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={busy}>
              Create draft
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

"use client";

import { Card } from "@/components/ui/primitives";
import type { TitleDetail } from "@/lib/types";
import { ImageSlot } from "./image-slot";

export function MediaTab({ title, attach, readOnly }: { title: TitleDetail; attach: (field: "poster_id" | "backdrop_id" | "logo_id", id: string | null) => Promise<void>; readOnly: boolean }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <Card className="p-4">
        <ImageSlot kind="poster" label="Poster" hint="2:3 · min 300×450" image={title.poster} disabled={readOnly} onAttach={(id) => attach("poster_id", id)} />
      </Card>
      <div className="space-y-4">
        <Card className="p-4">
          <ImageSlot kind="backdrop" label="Backdrop" hint="16:9 · min 960×540, 3840×2160 ideal" image={title.backdrop} titleText={title.title} disabled={readOnly} onAttach={(id) => attach("backdrop_id", id)} />
        </Card>
        <Card className="max-w-md p-4">
          <ImageSlot kind="logo" label="Title logo art" hint="Transparent PNG · optional" image={title.logo} disabled={readOnly} onAttach={(id) => attach("logo_id", id)} />
        </Card>
      </div>
    </div>
  );
}

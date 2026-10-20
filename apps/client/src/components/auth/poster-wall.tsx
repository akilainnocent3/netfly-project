"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

interface WallImage {
  key: string;
  blur: string;
}

/** Slowly drifting, dimmed wall of posters from the published catalog. */
export function PosterWall() {
  const [posters, setPosters] = useState<WallImage[]>([]);
  useEffect(() => {
    let alive = true;
    fetch("/api/v1/catalog/poster-wall")
      .then((r) => (r.ok ? r.json() : { results: [] }))
      .then((body: { results: WallImage[] }) => alive && setPosters(body.results))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  if (!posters.length) {
    return <div aria-hidden className="absolute inset-0 -z-20 bg-[linear-gradient(160deg,#16161d,#0b0b0f_55%)]" />;
  }
  const columns = Array.from({ length: 7 }, (_, c) => posters.filter((_, i) => i % 7 === c));
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-20 overflow-hidden">
      <div className="absolute -inset-x-[10%] -top-[20%] flex h-[140%] origin-center -rotate-[8deg] gap-3 opacity-45 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]">
        {columns.map((column, c) => (
          <div
            key={c}
            className="flex flex-1 flex-col gap-3 motion-safe:animate-[drift_60s_linear_infinite_alternate]"
            style={{ animationDelay: `${-c * 7}s`, marginTop: `${(c % 2) * -8}%` }}
          >
            {[...column, ...column].map((p, i) => (
              <div key={`${p.key}-${i}`} className="relative aspect-[2/3] w-full overflow-hidden rounded-lg">
                <Image src={p.key} alt="" fill sizes="15vw" placeholder="blur" blurDataURL={p.blur} className="object-cover" />
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-bg/70 via-bg/40 to-bg" />
    </div>
  );
}

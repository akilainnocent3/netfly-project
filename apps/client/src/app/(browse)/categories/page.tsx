"use client";

import Link from "next/link";
import { PageShell } from "@/components/browse/title-grid";
import { NetflyImage } from "@/components/ui/netfly-image";
import { SkeletonArea } from "@/components/ui/skeleton";
import { StateMessage } from "@/components/ui/state-message";
import { useGenres } from "@/lib/queries";

export default function CategoriesPage() {
  const genres = useGenres();
  return (
    <PageShell title="Categories" subtitle="Find something for every mood.">
      {genres.isPending ? (
        <SkeletonArea loaderClassName="bottom-auto h-[min(40vh,320px)]">
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <li key={i} className="skeleton aspect-[16/8] rounded-xl" />
            ))}
          </ul>
        </SkeletonArea>
      ) : genres.data?.length ? (
        <ul
          className={`grid grid-cols-2 gap-3 transition-opacity md:grid-cols-3 xl:grid-cols-4 ${genres.isPlaceholderData ? "opacity-50" : ""}`}
        >
          {genres.data.map((g, i) => (
            <li key={g.id}>
              <Link
                href={`/categories/${g.slug}`}
                className="group bg-surface relative block aspect-[16/8] overflow-hidden rounded-xl ring-1 ring-white/5"
              >
                <NetflyImage
                  image={g.artwork ?? g.sample}
                  alt=""
                  sizes="(min-width:1280px) 25vw, (min-width:768px) 33vw, 50vw"
                  priority={i < 4}
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                  fallback={
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgb(var(--accent-rgb)/0.4),transparent_60%),#17171f]" />
                  }
                />
                <div className="absolute inset-0 bg-gradient-to-tr from-black/85 via-black/35 to-transparent" />
                <div className="absolute right-4 bottom-3 left-4">
                  <p className="text-h2 font-extrabold tracking-tight">{g.name}</p>
                  <p className="text-meta text-white/70">
                    {g.title_count} title{g.title_count === 1 ? "" : "s"}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <StateMessage title="No categories yet">
          Nothing matches this translation filter right now.
        </StateMessage>
      )}
    </PageShell>
  );
}

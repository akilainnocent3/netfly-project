import Link from "next/link";
import { getPublicConfig } from "@/lib/server-config";
import { publicLanding } from "@/lib/seo";
import { Logo } from "../brand/logo";
import { Button } from "../ui/button";

/**
 * Signed-out chrome for the crawlable pages (landing, public title and genre pages). Links are
 * plain anchors: these pages live beside the app's intercepting routes and must always load as
 * full documents.
 */
export async function PublicShell({
  children,
  next,
  overlay = false,
}: {
  children: React.ReactNode;
  /** Where Sign In should return to. */
  next?: string;
  /** Float the header over a full-bleed hero. */
  overlay?: boolean;
}) {
  const [config, landing] = await Promise.all([getPublicConfig(), publicLanding()]);
  const footer =
    typeof config["branding.footer_text"] === "string" ? config["branding.footer_text"] : "";
  const signIn = next ? `/login?next=${encodeURIComponent(next)}` : "/login";
  return (
    <div className="bg-bg flex min-h-dvh flex-col">
      <header
        className={
          overlay
            ? "absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-black/80 to-transparent"
            : "border-line border-b"
        }
      >
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-[max(4vw,16px)] py-5 pt-[max(20px,env(safe-area-inset-top))]">
          <Logo href="/" />
          <Button asChild variant="accent" size="sm">
            <a href={signIn}>Sign In</a>
          </Button>
        </div>
      </header>
      <main id="content" className="flex-1">
        {children}
      </main>
      <footer className="border-line text-muted border-t px-[max(4vw,16px)] py-12 pb-[max(48px,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-[1400px]">
          {landing?.genres.length ? (
            <nav aria-label="Browse by genre">
              <h2 className="text-body mb-4 font-bold text-white">Browse by genre</h2>
              <ul className="text-meta grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 md:grid-cols-4">
                {landing.genres.map((g) => (
                  <li key={g.slug}>
                    <a href={`/genre/${g.slug}`} className="hover:text-white hover:underline">
                      {g.name}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
          <p className="text-meta mt-10">
            <span>{footer}</span>
            <span className="mx-2" aria-hidden>
              ·
            </span>
            <Link href="/legal/terms" className="hover:text-white hover:underline">
              Terms
            </Link>
            <span className="mx-2" aria-hidden>
              ·
            </span>
            <Link href="/legal/privacy" className="hover:text-white hover:underline">
              Privacy
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}

/** Poster card for public grids (server-rendered, plain link). */
export function PublicPoster({
  href,
  title,
  image,
  rank,
}: {
  href: string;
  title: string;
  image: { key: string; blur?: string | null; color?: string | null } | null | undefined;
  rank?: number;
}) {
  return (
    <a
      href={href}
      className="group block rounded-md outline-offset-4 focus-visible:outline-2 focus-visible:outline-white"
    >
      <span className="bg-surface relative block aspect-[2/3] overflow-hidden rounded-md">
        {image ? (
          // Server-rendered <img> through the loader URL: no client JS needed on public pages.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/v1/img/${image.key}/w480`}
            srcSet={`/api/v1/img/${image.key}/w320 320w, /api/v1/img/${image.key}/w480 480w, /api/v1/img/${image.key}/w640 640w`}
            sizes="(min-width: 1024px) 16vw, (min-width: 640px) 25vw, 45vw"
            alt={title}
            loading="lazy"
            decoding="async"
            className="size-full object-cover transition-transform duration-200 ease-out group-hover:scale-[1.04] motion-reduce:transition-none"
            style={{ backgroundColor: image.color || undefined }}
          />
        ) : (
          <span className="text-body grid size-full place-items-center p-3 text-center font-bold">
            {title}
          </span>
        )}
        {rank ? (
          <span className="bg-accent text-caption absolute top-0 right-0 rounded-bl-md px-1.5 py-0.5 font-black text-white">
            TOP {rank}
          </span>
        ) : null}
      </span>
      <span className="text-meta mt-2 block truncate text-white/80 group-hover:text-white">
        {title}
      </span>
    </a>
  );
}

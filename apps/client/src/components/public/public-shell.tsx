import Link from "next/link";
import { getPublicConfig } from "@/lib/server-config";
import { publicLanding } from "@/lib/seo";
import { Logo } from "../brand/logo";
import { Button } from "../ui/button";

/**
 * Chrome for the signed-out landing page (the marketing page at `/`). Everything else —
 * browsing, titles, genres — is the app itself, for signed-in and signed-out visitors alike.
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

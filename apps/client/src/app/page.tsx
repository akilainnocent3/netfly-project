import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRight } from "lucide-react";
import { PosterWall } from "@/components/auth/poster-wall";
import { PublicShell } from "@/components/public/public-shell";
import { Button } from "@/components/ui/button";
import { getPublicConfig } from "@/lib/server-config";
import { imageUrl, JsonLd, publicLanding, siteName, siteUrl } from "@/lib/seo";

const str = (v: unknown, fallback = "") => (typeof v === "string" && v ? v : fallback);

async function copy() {
  const config = await getPublicConfig();
  const name = siteName(config);
  return {
    config,
    name,
    headline: str(config["branding.signup_headline"], "Unlimited movies and series."),
    subtext: str(config["branding.signup_subtext"], "Pick a username and start watching."),
    tagline: str(config["branding.tagline"]),
    description: str(
      config["seo.default_description"],
      str(config["branding.tagline"], `Watch films and series on ${name}.`),
    ),
  };
}

const FAQ = [
  {
    q: "What can I watch?",
    a: "Films and series across every genre, in original and translated versions, with new titles added regularly.",
  },
  {
    q: "Where can I watch?",
    a: "In any modern browser on your phone, tablet, laptop or TV. Your progress follows you from device to device.",
  },
  {
    q: "How do recommendations work?",
    a: "Your picks get better as you watch and rate: Top picks, Because you liked, and rows built around the genres you enjoy.",
  },
  {
    q: "How do I get started?",
    a: "Create an account with a username and password, and start watching in seconds.",
  },
];

export async function generateMetadata(): Promise<Metadata> {
  const [{ name, tagline, description }, landing, config] = await Promise.all([
    copy(),
    publicLanding(),
    getPublicConfig(),
  ]);
  const site = await siteUrl(config);
  const image = imageUrl(site, landing?.trending[0]?.backdrop?.key, 1280);
  const title = tagline ? `${name} – ${tagline}` : name;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: `${site}/` },
    openGraph: {
      type: "website",
      url: `${site}/`,
      title,
      description,
      images: image ? [{ url: image, width: 1280, height: 720 }] : undefined,
    },
    twitter: { card: "summary_large_image", title, description, images: image },
  };
}

/** Signed-out landing page (signed-in visitors are redirected to /browse by middleware). */
export default async function Landing() {
  const [{ config, name, headline, subtext, description }, landing] = await Promise.all([
    copy(),
    publicLanding(),
  ]);
  const site = await siteUrl(config);
  const logo = str(config["branding.logo_url"]);
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${site}/#organization`,
        name,
        url: `${site}/`,
        ...(logo ? { logo } : {}),
      },
      {
        "@type": "WebSite",
        "@id": `${site}/#website`,
        name,
        url: `${site}/`,
        description,
        publisher: { "@id": `${site}/#organization` },
      },
      {
        "@type": "FAQPage",
        mainEntity: FAQ.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };
  const trending = landing?.trending ?? [];

  return (
    <PublicShell overlay>
      <JsonLd data={graph} />
      <section className="relative isolate flex min-h-[86svh] items-center justify-center overflow-hidden bg-black px-[max(4vw,16px)] pt-28 pb-20 text-center">
        <PosterWall />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,rgb(0_0_0/0.4)_0%,rgb(0_0_0/0.9)_80%)]"
        />
        <div className="max-w-3xl">
          <h1 className="text-display font-black text-balance">{headline}</h1>
          <p className="text-lead mt-5 text-white/90">{subtext}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild variant="accent" size="lg">
              <Link href="/signup">
                Get Started <ChevronRight className="size-5" />
              </Link>
            </Button>
            <Button asChild variant="secondary" size="lg">
              <Link href="/login">Sign In</Link>
            </Button>
          </div>
        </div>
      </section>

      {trending.length ? (
        <section aria-labelledby="trending" className="px-[max(4vw,16px)] py-12">
          <h2 id="trending" className="text-h2 mb-5 font-bold">
            Trending Now
          </h2>
          <ol className="no-scrollbar -mx-[max(4vw,16px)] flex snap-x gap-2 overflow-x-auto scroll-smooth px-[max(4vw,16px)] pb-2 md:gap-4">
            {trending.map((t, i) => (
              <li key={t.id} className="flex shrink-0 snap-start items-end">
                <span
                  aria-hidden
                  className="text-numeral -mr-[0.12em] leading-none font-black text-black [-webkit-text-stroke:2px_rgb(255_255_255/0.6)]"
                >
                  {i + 1}
                </span>
                <a
                  href={`/title/${t.slug}`}
                  className="bg-surface relative block aspect-[2/3] w-[clamp(104px,13vw,180px)] overflow-hidden rounded-md outline-offset-4 transition-transform duration-200 ease-out hover:scale-[1.04] focus-visible:outline-2 focus-visible:outline-white motion-reduce:transition-none"
                >
                  {t.poster ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/v1/img/${t.poster.key}/w320`}
                      srcSet={`/api/v1/img/${t.poster.key}/w320 320w, /api/v1/img/${t.poster.key}/w480 480w`}
                      sizes="(min-width: 768px) 13vw, 120px"
                      alt={t.title}
                      loading={i < 6 ? "eager" : "lazy"}
                      decoding="async"
                      className="size-full object-cover"
                      style={{ backgroundColor: t.poster.color || undefined }}
                    />
                  ) : (
                    <span className="text-body grid size-full place-items-center p-2 text-center font-bold">
                      {t.title}
                    </span>
                  )}
                  <span className="sr-only">
                    Number {i + 1}: {t.title}
                  </span>
                </a>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {landing?.genres.length ? (
        <section aria-labelledby="genres" className="px-[max(4vw,16px)] pb-12">
          <h2 id="genres" className="text-h2 mb-5 font-bold">
            Explore by genre
          </h2>
          <ul className="flex flex-wrap gap-2">
            {landing.genres.map((g) => (
              <li key={g.slug}>
                <Button asChild variant="secondary" size="sm">
                  <a href={`/genre/${g.slug}`}>{g.name}</a>
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="faq" className="mx-auto max-w-4xl px-[max(4vw,16px)] pb-16">
        <h2 id="faq" className="text-h1 mb-6 text-center font-bold">
          Frequently Asked Questions
        </h2>
        <div className="space-y-2">
          {FAQ.map((f) => (
            <details key={f.q} className="group bg-elevated rounded-md">
              <summary className="text-lead flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 font-medium select-none hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-white [&::-webkit-details-marker]:hidden">
                {f.q}
                <span
                  aria-hidden
                  className="text-h1 leading-none font-light transition-transform duration-200 group-open:rotate-45 motion-reduce:transition-none"
                >
                  +
                </span>
              </summary>
              <p className="text-lead border-line border-t px-6 py-5 text-white/90">{f.a}</p>
            </details>
          ))}
        </div>
        <div className="mt-10 text-center">
          <Button asChild variant="accent" size="lg">
            <Link href="/signup">
              Get Started <ChevronRight className="size-5" />
            </Link>
          </Button>
        </div>
      </section>
    </PublicShell>
  );
}

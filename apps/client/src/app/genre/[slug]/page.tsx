import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicPoster, PublicShell } from "@/components/public/public-shell";
import { Button } from "@/components/ui/button";
import { getPublicConfig } from "@/lib/server-config";
import { JsonLd, publicGenre, siteName, siteUrl } from "@/lib/seo";

async function load(slug: string) {
  const [data, config] = await Promise.all([publicGenre(slug), getPublicConfig()]);
  const row = data?.rows[0];
  if (!row || !row.items.length) return null;
  return { row, name: siteName(config), site: await siteUrl(config) };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const data = await load(slug);
  if (!data) return { title: "Genre not found", robots: { index: false } };
  const { row, name, site } = data;
  const examples = row.items
    .slice(0, 3)
    .map((t) => t.title)
    .join(", ");
  const description = `Watch ${row.title} films and series on ${name}, including ${examples}.`;
  const url = `${site}/genre/${slug}`;
  return {
    title: `${row.title} films & series`,
    description,
    alternates: { canonical: url },
    openGraph: { type: "website", url, title: `${row.title} · ${name}`, description },
  };
}

/** Public, crawlable genre directory page (signed-in viewers are sent to /categories/<slug>). */
export default async function GenrePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await load(slug);
  if (!data) notFound();
  const { row, site } = data;
  const list = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: row.title,
    itemListElement: row.items.map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${site}/title/${t.slug}`,
      name: t.title,
    })),
  };
  return (
    <PublicShell next={`/categories/${slug}`}>
      <JsonLd data={list} />
      <div className="px-[max(4vw,16px)] py-10 md:py-14">
        <nav aria-label="Breadcrumb" className="text-meta text-muted mb-3">
          <Link href="/" className="hover:text-white">
            Home
          </Link>
          <span className="mx-1.5" aria-hidden>
            ›
          </span>
          <span aria-current="page">{row.title}</span>
        </nav>
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-h1 font-bold">{row.title} films &amp; series</h1>
          <Button asChild variant="accent">
            <a href={`/signup?next=${encodeURIComponent(`/categories/${slug}`)}`}>Join now</a>
          </Button>
        </div>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {row.items.map((t) => (
            <li key={t.id}>
              <PublicPoster
                href={`/title/${t.slug}`}
                title={t.title}
                image={t.poster}
                rank={t.top10_rank ?? undefined}
              />
            </li>
          ))}
        </ul>
      </div>
    </PublicShell>
  );
}

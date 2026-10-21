import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageShell, TitleGrid } from "@/components/browse/title-grid";
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

/**
 * Crawlable genre page in the app's own design (header, cards, hover cards), server-rendered.
 * Signed-in viewers are sent to /categories/<slug> (same grid, with sorting) by middleware.
 */
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
    <>
      <JsonLd data={list} />
      <PageShell title={`${row.title} films & series`}>
        <nav aria-label="Breadcrumb" className="text-meta text-muted -mt-4 mb-6">
          <Link href="/browse" className="hover:text-white">
            Home
          </Link>
          <span className="mx-1.5" aria-hidden>
            ›
          </span>
          <Link href="/categories" className="hover:text-white">
            Categories
          </Link>
          <span className="mx-1.5" aria-hidden>
            ›
          </span>
          <span aria-current="page">{row.title}</span>
        </nav>
        <TitleGrid items={row.items} />
      </PageShell>
    </>
  );
}

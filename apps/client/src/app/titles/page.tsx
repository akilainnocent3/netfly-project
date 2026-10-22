import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicShell } from "@/components/public/public-shell";
import { getPublicConfig } from "@/lib/server-config";
import { JsonLd, publicCatalog, siteName, siteUrl } from "@/lib/seo";

type Props = { searchParams: Promise<{ page?: string }> };

const pageNumber = (raw?: string) => {
  const n = Number(raw ?? 1);
  return Number.isInteger(n) && n >= 1 ? n : 0;
};
const pageHref = (n: number) => (n === 1 ? "/titles" : `/titles?page=${n}`);

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const page = pageNumber((await searchParams).page);
  const [config, data] = await Promise.all([getPublicConfig(), page ? publicCatalog(page) : null]);
  if (!data) return { title: "Page not found", robots: { index: false } };
  const name = siteName(config);
  const site = await siteUrl(config);
  const suffix = data.pages > 1 ? ` (page ${page} of ${data.pages})` : "";
  const title = `All films & series A–Z${suffix}`;
  const description = `Every film and series you can watch on ${name}, from A to Z: ${data.count} titles${suffix}.`;
  return {
    title,
    description,
    // Each page of the list is its own canonical URL.
    alternates: { canonical: `${site}${pageHref(page)}` },
    openGraph: { type: "website", url: `${site}${pageHref(page)}`, title, description },
  };
}

/**
 * The A–Z catalogue: every published title, server-rendered with plain links, so each title is
 * two clicks from the home page for crawlers (landing → /titles → title), not only in the
 * sitemap. Signed-in viewers are sent to /categories by middleware.
 */
export default async function TitlesPage({ searchParams }: Props) {
  const page = pageNumber((await searchParams).page);
  const [config, data] = await Promise.all([getPublicConfig(), page ? publicCatalog(page) : null]);
  if (!data) notFound();
  const site = await siteUrl(config);
  const groups: Array<{ letter: string; items: typeof data.results }> = [];
  for (const item of data.results) {
    const last = groups[groups.length - 1];
    if (last?.letter === item.letter) last.items.push(item);
    else groups.push({ letter: item.letter, items: [item] });
  }
  const list = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "All films & series A–Z",
    numberOfItems: data.count,
    itemListElement: data.results.map((t, i) => ({
      "@type": "ListItem",
      position: (page - 1) * data.page_size + i + 1,
      url: `${site}/title/${t.slug}`,
      name: t.title,
    })),
  };
  const pages = Array.from({ length: data.pages }, (_, i) => i + 1);

  return (
    <PublicShell next="/browse">
      <JsonLd data={list} />
      <div className="mx-auto max-w-[1400px] px-[max(4vw,16px)] py-10">
        <h1 className="text-h1 mb-2 font-black tracking-tight">All films &amp; series A–Z</h1>
        <p className="text-muted text-body mb-6">
          {data.count} titles{data.pages > 1 ? ` · page ${page} of ${data.pages}` : ""}
        </p>

        <nav aria-label="Jump to letter" className="mb-8">
          <ul className="flex flex-wrap gap-1">
            {data.letters.map(({ letter, page: target }) => (
              <li key={letter}>
                <a
                  href={
                    target === page ? `#letter-${letter}` : `${pageHref(target)}#letter-${letter}`
                  }
                  className="text-body grid size-11 place-items-center rounded-md font-bold hover:bg-white/10"
                >
                  {letter}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="space-y-8">
          {groups.map((group) => (
            <section key={group.letter} aria-labelledby={`letter-${group.letter}`}>
              <h2
                id={`letter-${group.letter}`}
                className="text-h2 border-line mb-3 scroll-mt-6 border-b pb-2 font-bold"
              >
                {group.letter}
              </h2>
              <ul className="grid grid-cols-1 gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
                {group.items.map((t) => (
                  <li key={t.slug}>
                    <a
                      href={`/title/${t.slug}`}
                      className="text-body flex min-h-11 items-baseline gap-2 py-2 hover:underline"
                    >
                      <span className="font-semibold text-white">{t.title}</span>
                      <span className="text-muted text-meta">
                        {[t.year, t.type === "series" ? "Series" : "Film"]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        {data.pages > 1 && (
          <nav aria-label="Pages" className="mt-10">
            <ul className="flex flex-wrap gap-1">
              {pages.map((n) => (
                <li key={n}>
                  <a
                    href={pageHref(n)}
                    aria-current={n === page ? "page" : undefined}
                    className="text-body grid size-11 place-items-center rounded-md hover:bg-white/10 aria-[current=page]:bg-white aria-[current=page]:text-black"
                  >
                    {n}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
    </PublicShell>
  );
}

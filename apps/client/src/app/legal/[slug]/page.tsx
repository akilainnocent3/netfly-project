import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Markdown } from "@/components/ui/markdown";
import { getPublicConfig } from "@/lib/server-config";
import { siteUrl } from "@/lib/seo";

const API = process.env.NETFLY_API_URL ?? "http://localhost:8000";

type Legal = { title: string; body_markdown: string; updated_at: string };

async function load(slug: string): Promise<Legal | null> {
  const res = await fetch(`${API}/api/v1/legal/${encodeURIComponent(slug)}`, {
    next: { revalidate: 300 },
  }).catch(() => null);
  return res?.ok ? ((await res.json()) as Legal) : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = await load(slug);
  if (!page) return { title: "Page not found", robots: { index: false } };
  const site = await siteUrl(await getPublicConfig());
  return { title: page.title, alternates: { canonical: `${site}/legal/${slug}` } };
}

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await load(slug);
  if (!page) notFound();
  return (
    <main className="mx-auto max-w-3xl px-6 py-20">
      <p className="text-muted text-meta">
        Updated {new Date(page.updated_at).toLocaleDateString()}
      </p>
      <Markdown source={page.body_markdown} />
    </main>
  );
}

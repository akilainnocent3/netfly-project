import { notFound } from "next/navigation";
import { Markdown } from "@/components/ui/markdown";

const API = process.env.NETFLY_API_URL ?? "http://localhost:8000";

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const res = await fetch(`${API}/api/v1/legal/${encodeURIComponent(slug)}`, { next: { revalidate: 300 } });
  if (!res.ok) notFound();
  const page = (await res.json()) as { title: string; body_markdown: string; updated_at: string };
  return (
    <main className="mx-auto max-w-3xl px-6 py-20">
      <p className="text-sm text-muted">Updated {new Date(page.updated_at).toLocaleDateString()}</p>
      <Markdown source={page.body_markdown} />
    </main>
  );
}

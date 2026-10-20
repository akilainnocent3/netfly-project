import type { Metadata } from "next";
import { HomeFeed } from "@/components/browse/home-feed";
import { TitleModal } from "@/components/title/title-modal";

const API = process.env.NETFLY_API_URL ?? "http://localhost:8000";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  try {
    const res = await fetch(`${API}/api/v1/titles/${encodeURIComponent(slug)}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return {};
    const data = (await res.json()) as { title: { title: string; short_synopsis: string } };
    return { title: data.title.title, description: data.title.short_synopsis };
  } catch {
    return {};
  }
}

/** Deep link: the title opens as a modal over the home feed. */
export default async function TitlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <>
      <HomeFeed />
      <TitleModal slug={slug} fallbackHref="/browse" />
    </>
  );
}

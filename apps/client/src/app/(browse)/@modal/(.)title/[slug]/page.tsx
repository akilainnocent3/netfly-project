import { TitleModal } from "@/components/title/title-modal";

export default async function InterceptedTitle({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <TitleModal slug={slug} />;
}

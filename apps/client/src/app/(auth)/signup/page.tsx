import { redirect } from "next/navigation";
import { safeNext } from "@/lib/safe-next";

/** /signup starts at step 1 (keeping where the visitor was headed). */
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const target = next ? safeNext(next, "") : "";
  redirect(target ? `/signup/name?next=${encodeURIComponent(target)}` : "/signup/name");
}

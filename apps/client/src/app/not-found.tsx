import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Page not found", robots: { index: false } };

export default function NotFound() {
  return (
    <main className="bg-bg grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <p className="text-numeral text-subtle font-black">404</p>
        <h1 className="text-h1 mt-2 font-bold">Lost your way?</h1>
        <p className="text-lead text-muted mx-auto mt-3 max-w-md">
          We can&apos;t find that page. There&apos;s plenty to explore on the home page.
        </p>
        <Button asChild variant="accent" size="lg" className="mt-8">
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    </main>
  );
}

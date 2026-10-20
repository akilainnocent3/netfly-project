"use client";

import { m } from "framer-motion";
import Link from "next/link";
import { Logo } from "../brand/logo";
import { useConfig } from "../providers/config";
import { PosterWall } from "./poster-wall";

/** Sign-in / sign-up layout: poster wall under a dark vignette, logo top-left, centred black card. */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  const config = useConfig();
  return (
    <main className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-black">
      <PosterWall />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,rgb(0_0_0/0.35)_0%,rgb(0_0_0/0.85)_75%)]"
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-b from-black/80 via-transparent to-black/90"
      />
      <header className="px-6 py-6 md:px-12 md:py-7">
        <Logo href="/" />
      </header>
      <div className="flex flex-1 items-center justify-center px-4 pb-16 sm:px-6">
        <m.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-[450px] rounded-md bg-black/75 px-6 py-10 sm:px-14 sm:py-12"
        >
          <h1 className="text-h1 font-bold">{title}</h1>
          {subtitle && <p className="text-body text-muted mt-2">{subtitle}</p>}
          <div className="mt-7">{children}</div>
          <div className="text-body text-muted mt-8">{footer}</div>
        </m.section>
      </div>
      <footer className="text-meta text-muted bg-black/60 px-6 py-6 text-center md:px-12">
        <span>{config.str("branding.footer_text")}</span>
        <span className="mx-2">·</span>
        <Link href="/legal/terms" className="hover:text-white hover:underline">
          Terms
        </Link>
        <span className="mx-2">·</span>
        <Link href="/legal/privacy" className="hover:text-white hover:underline">
          Privacy
        </Link>
      </footer>
    </main>
  );
}

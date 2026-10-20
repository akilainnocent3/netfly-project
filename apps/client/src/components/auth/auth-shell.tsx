"use client";

import { m } from "framer-motion";
import Link from "next/link";
import { Logo } from "../brand/logo";
import { useConfig } from "../providers/config";
import { PosterWall } from "./poster-wall";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  busy,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer: React.ReactNode;
  busy?: boolean;
}) {
  const config = useConfig();
  return (
    <main className="relative isolate flex min-h-dvh flex-col overflow-hidden">
      <PosterWall />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,rgb(var(--accent-rgb)/0.22),transparent_60%)]"
      />
      <div aria-hidden className="grain absolute inset-0 -z-10" />
      <header className="flex items-center justify-between px-6 py-6 md:px-12">
        <Logo href="/" />
      </header>
      <div className="flex flex-1 items-center justify-center px-4 pb-16">
        <m.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-[420px] overflow-hidden rounded-3xl border border-white/10 bg-black/55 p-7 shadow-[0_40px_120px_-20px_rgb(0_0_0/0.8)] backdrop-blur-2xl md:p-9"
        >
          <div aria-hidden className="absolute inset-x-0 top-0 h-[2px] overflow-hidden">
            <m.div
              className="bg-accent h-full w-1/3"
              initial={false}
              animate={busy ? { x: ["-100%", "300%"], opacity: 1 } : { opacity: 0 }}
              transition={
                busy ? { repeat: Infinity, duration: 1.1, ease: "easeInOut" } : { duration: 0.2 }
              }
            />
          </div>
          <h1 className="text-[28px] leading-tight font-bold tracking-tight md:text-[32px]">
            {title}
          </h1>
          {subtitle && <p className="text-muted mt-2 text-[15px]">{subtitle}</p>}
          <div className="mt-7">{children}</div>
          <div className="text-muted mt-7 text-sm">{footer}</div>
        </m.section>
      </div>
      <footer className="text-subtle px-6 pb-6 text-center text-xs md:px-12">
        <span>{config.str("branding.footer_text")}</span>
        <span className="mx-2">·</span>
        <Link href="/legal/terms" className="hover:text-fg">
          Terms
        </Link>
        <span className="mx-2">·</span>
        <Link href="/legal/privacy" className="hover:text-fg">
          Privacy
        </Link>
      </footer>
    </main>
  );
}

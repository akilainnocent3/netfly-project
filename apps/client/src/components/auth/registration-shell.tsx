"use client";

import { m } from "framer-motion";
import Link from "next/link";
import { Logo } from "../brand/logo";
import { Button } from "../ui/button";
import { useAuth } from "../providers/auth";
import { useConfig } from "../providers/config";

/**
 * The white registration layout (signup steps, plan picker, verification, payment): logo top
 * left, Sign In (or Sign Out) top right, one question per screen, a light footer.
 */
export function RegistrationShell({
  children,
  wide = false,
  signInHref = "/login",
}: {
  children: React.ReactNode;
  /** The plan picker needs the full width; the question steps are a narrow column. */
  wide?: boolean;
  signInHref?: string;
}) {
  const config = useConfig();
  const { status, signOut } = useAuth();
  return (
    <div
      data-testid="registration"
      className="flex min-h-dvh flex-col bg-white text-[#333] [color-scheme:light]"
    >
      <header className="flex h-[76px] shrink-0 items-center justify-between border-b border-[#e6e6e6] px-[max(4vw,16px)] md:h-[90px]">
        <Logo href="/" tone="light" compact={false} className="[&_img]:h-7 md:[&_img]:h-9" />
        {status === "authenticated" ? (
          <Button variant="ghost-light" className="text-lead font-bold" onClick={() => signOut()}>
            Sign Out
          </Button>
        ) : (
          <Link
            href={signInHref}
            className="text-lead rounded font-bold text-[#333] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0071eb]"
          >
            Sign In
          </Link>
        )}
      </header>
      <main id="content" className="flex flex-1 flex-col">
        <m.div
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className={
            wide
              ? "mx-auto flex w-full max-w-[1180px] flex-1 flex-col px-[max(4vw,16px)] pt-8 pb-10"
              : "mx-auto flex w-full max-w-[440px] flex-1 flex-col px-4 pt-10 pb-6 md:pt-16"
          }
        >
          {children}
        </m.div>
      </main>
      <footer className="text-meta border-t border-[#e6e6e6] bg-[#f3f3f3] px-[max(4vw,16px)] py-8 text-[#595959]">
        <p>{config.str("branding.footer_text")}</p>
        <p className="mt-3 flex gap-5">
          <Link href="/legal/terms" className="hover:underline">
            Terms of Use
          </Link>
          <Link href="/legal/privacy" className="hover:underline">
            Privacy
          </Link>
        </p>
      </footer>
    </div>
  );
}

/** "STEP 1 OF 3" + heading + helper text, Netflix registration style. */
export function StepHeading({
  step,
  of,
  title,
  children,
}: {
  step?: number;
  of?: number;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6">
      {step ? (
        <p className="text-meta tracking-wide text-[#333] uppercase">
          Step <b>{step}</b> of <b>{of}</b>
        </p>
      ) : null}
      <h1 className="mt-1 text-[clamp(1.75rem,4vw,2rem)] leading-tight font-bold tracking-tight text-[#333]">
        {title}
      </h1>
      {children ? <div className="text-lead mt-3 text-[#333]">{children}</div> : null}
    </div>
  );
}

/** The step's primary action: full width, sticks above the keyboard on phones. */
export function StepActions({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 -mx-4 mt-auto bg-white px-4 pt-4 pb-[max(16px,env(safe-area-inset-bottom))] md:static md:mx-0 md:mt-6 md:bg-transparent md:p-0">
      {children}
    </div>
  );
}

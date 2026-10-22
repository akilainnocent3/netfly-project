"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { m } from "framer-motion";
import { X } from "lucide-react";
import Link from "next/link";
import { formatCountdown, useCountdown } from "@/lib/usage-format";
import { SCOPE_POSSESSIVE, tightestScope, type UsageSnapshot } from "@/lib/usage";
import { Button, IconButton } from "../ui/button";
import { useRouteChangePending } from "@/lib/use-navigate";

const UPGRADE_HREF = "/signup/plan?from=account";

/** "You've reached today's viewing limit" + live reset countdown + Upgrade / Back to browse. */
function LimitBody({
  snapshot,
  onBack,
  backLabel = "Back to browse",
  titleAs: Title = "h2",
  titleId,
}: {
  snapshot: UsageSnapshot | null;
  onBack: () => void;
  backLabel?: string;
  titleAs?: React.ElementType;
  titleId?: string;
}) {
  const leaving = useRouteChangePending();
  const scope = (snapshot && tightestScope(snapshot)) ?? "day";
  const resetsAt = snapshot?.resets_at[scope] ?? null;
  const left = useCountdown(resetsAt, snapshot?.server_time);
  return (
    <div className="mx-auto max-w-lg text-center" data-testid="usage-limit">
      <Title
        id={titleId}
        className="text-[clamp(1.6rem,4vw,2.25rem)] leading-tight font-black tracking-tight"
      >
        You&apos;ve reached {SCOPE_POSSESSIVE[scope]} viewing limit
      </Title>
      <p className="text-lead mt-4 text-[#b3b3b3]">
        Your {snapshot?.plan.name ?? ""} plan includes a set amount of viewing time. Browsing is
        always free — playback picks up again when your limit resets.
      </p>
      {left !== null ? (
        <p className="mt-6" aria-live="off">
          <span className="text-meta block tracking-[0.18em] text-[#a3a3a3] uppercase">
            Resets in
          </span>
          <span
            className="text-[clamp(2rem,6vw,3rem)] font-bold tabular-nums"
            data-testid="limit-countdown"
          >
            {formatCountdown(left)}
          </span>
        </p>
      ) : null}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Button asChild variant="accent" size="lg" className="h-12 rounded px-8">
          <Link href={UPGRADE_HREF}>Upgrade plan</Link>
        </Button>
        <Button
          variant="secondary"
          size="lg"
          className="h-12 rounded px-8"
          loading={leaving.pending}
          onClick={() => {
            leaving.mark();
            onBack();
          }}
        >
          {backLabel}
        </Button>
      </div>
    </div>
  );
}

/** Full-screen black overlay over the paused frame (player, watch page). */
export function LimitOverlay({
  snapshot,
  onBack,
}: {
  snapshot: UsageSnapshot | null;
  onBack: () => void;
}) {
  return (
    <m.div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="limit-title"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="absolute inset-0 z-30 grid place-items-center bg-black/92 p-6"
      onPointerUp={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <LimitBody snapshot={snapshot} onBack={onBack} titleAs="h1" titleId="limit-title" />
    </m.div>
  );
}

/** Pressing Play while the allowance is spent: the same message in a modal. */
export function LimitDialog({
  snapshot,
  open,
  onClose,
}: {
  snapshot: UsageSnapshot | null;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay asChild>
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[120] bg-black/80"
          />
        </Dialog.Overlay>
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed top-1/2 left-1/2 z-[121] w-[min(560px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 outline-none"
        >
          <m.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="relative rounded-md bg-black px-6 pt-12 pb-10 shadow-[0_24px_80px_rgb(0_0_0/0.8)] ring-1 ring-white/10 sm:px-10"
          >
            <Dialog.Close asChild>
              <IconButton
                variant="ghost"
                size="sm"
                label="Close"
                className="absolute top-3 right-3"
              >
                <X />
              </IconButton>
            </Dialog.Close>
            <LimitBody snapshot={snapshot} onBack={onClose} titleAs={Dialog.Title} />
          </m.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

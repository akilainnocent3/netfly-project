"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { m } from "framer-motion";
import { useState } from "react";
import { Button } from "./button";

/**
 * Netflix-style confirmation (dark, scale-in). The confirm button shows the loader while the
 * action runs and the dialog can't be dismissed mid-request; it closes when the action resolves.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  children,
  confirmLabel,
  cancelLabel = "Keep it",
  destructive,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** Resolve to close; throw to keep the dialog open (the caller toasts the error). */
  onConfirm: () => Promise<unknown>;
}) {
  const [pending, setPending] = useState(false);
  const run = async () => {
    if (pending) return;
    setPending(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch {
      /* stays open */
    } finally {
      setPending(false);
    }
  };
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <Dialog.Portal>
        <Dialog.Overlay asChild>
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[120] bg-black/75"
          />
        </Dialog.Overlay>
        <Dialog.Content className="fixed top-1/2 left-1/2 z-[121] w-[min(460px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 outline-none">
          <m.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="bg-surface rounded-md p-7 shadow-[0_24px_80px_rgb(0_0_0/0.8)] ring-1 ring-white/10"
          >
            <Dialog.Title className="text-h3 font-bold">{title}</Dialog.Title>
            <Dialog.Description asChild>
              <div className="text-body mt-3 text-[#b3b3b3]">{children}</div>
            </Dialog.Description>
            <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button variant="secondary" disabled={pending} onClick={() => onOpenChange(false)}>
                {cancelLabel}
              </Button>
              <Button
                variant={destructive ? "accent" : "play"}
                loading={pending}
                onClick={() => void run()}
              >
                {confirmLabel}
              </Button>
            </div>
          </m.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

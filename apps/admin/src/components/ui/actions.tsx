"use client";

import { ApiError } from "@netfly/api-client";
import { cn, LazyLogoLoader } from "@netfly/ui";
import * as Dialog from "@radix-ui/react-dialog";

import { createContext, forwardRef, useCallback, useContext, useRef, useState } from "react";
import { useBusyClick } from "@/lib/use-pending";
import { useToast } from "../providers/toast";
import { Button } from "./primitives";

/** Icon-only button: aria-label required; disabled + spinner while `loading`. */
export const IconButton = forwardRef<
  HTMLButtonElement,
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & {
    label: string;
    loading?: boolean;
    tone?: "ghost" | "overlay" | "danger";
    size?: "sm" | "md";
  }
>(function IconButton(
  { label, loading, tone = "ghost", size = "md", className, children, disabled, onClick, ...props },
  ref,
) {
  const [clickBusy, handleClick] = useBusyClick(onClick);
  const busy = loading || clickBusy;
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-md transition-colors disabled:pointer-events-none disabled:opacity-50",
        size === "sm" ? "size-6" : "size-8",
        tone === "ghost" && "text-muted hover:bg-hover hover:text-fg",
        tone === "overlay" && "bg-black/60 text-white backdrop-blur hover:bg-black/80",
        tone === "danger" && "text-muted hover:bg-red-500/10 hover:text-red-500",
        className,
      )}
      {...props}
      onClick={handleClick}
    >
      {busy ? (
        <LazyLogoLoader size="sm" decorative delay={0} className="text-current [--nf-size:14px]" />
      ) : (
        children
      )}
    </button>
  );
});

export function errorMessage(error: unknown, fallback = "Something went wrong"): string {
  if (error instanceof ApiError) return Object.values(error.fields)[0] ?? error.message;
  return error instanceof Error ? error.message : fallback;
}

/**
 * Single-flight async action: `run` is ignored while pending, and every outcome
 * toasts (`success` message, or the API's error message).
 */
export function useAction<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  opts: { success?: string | ((result: R) => string | null); error?: string } = {},
) {
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const run = useCallback(
    async (...args: A): Promise<R | undefined> => {
      if (busy.current) return undefined;
      busy.current = true;
      setPending(true);
      try {
        const result = await fnRef.current(...args);
        const { success } = optsRef.current;
        const message = typeof success === "function" ? success(result) : success;
        if (message) toast(message);
        return result;
      } catch (error) {
        toast(errorMessage(error, optsRef.current.error), "error");
        return undefined;
      } finally {
        busy.current = false;
        setPending(false);
      }
    },
    [toast],
  );
  return { run, pending };
}

interface ConfirmOptions {
  title: string;
  body?: React.ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  /** Runs while the dialog stays open with a loading confirm button. Throw to keep it open. */
  action: () => Promise<unknown>;
  success?: string;
}

const ConfirmContext = createContext<(opts: ConfirmOptions) => void>(() => undefined);

/** Destructive actions ask first; the confirm button shows loading while the request runs. */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const toast = useToast();
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [pending, setPending] = useState(false);
  const confirm = useCallback((o: ConfirmOptions) => setOpts(o), []);
  const run = async () => {
    if (!opts || pending) return;
    setPending(true);
    try {
      await opts.action();
      if (opts.success) toast(opts.success);
      setOpts(null);
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setPending(false);
    }
  };
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog.Root open={!!opts} onOpenChange={(open) => !open && !pending && setOpts(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[160] bg-black/40" />
          <Dialog.Content className="border-line bg-panel fixed top-1/2 left-1/2 z-[161] w-[min(420px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-xl border p-5 shadow-2xl">
            <Dialog.Title className="text-[15px] font-semibold">{opts?.title}</Dialog.Title>
            <Dialog.Description asChild>
              <div className="text-muted mt-1.5 text-[13px]">{opts?.body}</div>
            </Dialog.Description>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpts(null)} disabled={pending}>
                Cancel
              </Button>
              <Button
                variant={opts?.destructive ? "danger" : "primary"}
                loading={pending}
                onClick={() => void run()}
                autoFocus
              >
                {opts?.confirmLabel ?? "Confirm"}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </ConfirmContext.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmContext);

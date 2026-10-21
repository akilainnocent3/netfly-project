"use client";

import { unwrap } from "@netfly/api-client";
import * as Dialog from "@radix-ui/react-dialog";
import { useQueryClient } from "@tanstack/react-query";
import { m } from "framer-motion";
import { X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  createContext,
  forwardRef,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api } from "@/lib/api";
import { takeFlash } from "@/lib/flash";
import { useUsage } from "@/lib/queries";
import { isExhausted, subscribeUsage, type UsageSnapshot } from "@/lib/usage";
import {
  clearIntent,
  INTENT_PARAM,
  intentNext,
  pendingIntent,
  saveIntent,
  watchPath,
  type Intent,
  type IntentAction,
} from "@/lib/intent";
import { LimitDialog } from "../billing/usage-limit";
import { BRAND } from "../brand/logo";
import { useAuth } from "../providers/auth";
import { Button, IconButton } from "../ui/button";
import { useToast } from "../ui/toast";

export interface GateRequest {
  action: IntentAction;
  slug: string;
  titleId?: number;
  episode?: number | null;
  value?: number;
  /** Shown in the gate: "…to start watching <title>." */
  titleName: string;
}

/** Returns true when the action may proceed now; otherwise opens the gate and returns false. */
type Gate = (request: GateRequest) => boolean;

const GateContext = createContext<Gate>(() => true);

function hasSessionCookie(): boolean {
  return typeof document !== "undefined" && /(?:^|;\s*)netfly_csrf_client=/.test(document.cookie);
}

export function AuthGateProvider({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState<{ intent: Intent; titleName: string } | null>(null);
  const [limit, setLimit] = useState<UsageSnapshot | null>(null);
  // The signed-in viewer's allowance: polled every 30 s, and pushed by every player heartbeat.
  useUsage(status === "authenticated");
  useEffect(() => {
    const unsubscribe = subscribeUsage((snapshot) => queryClient.setQueryData(["usage"], snapshot));
    return unsubscribe;
  }, [queryClient]);
  // Any navigation (the gate's own links included) closes it.
  useEffect(() => {
    setOpen(null);
    setLimit(null);
  }, [pathname]);
  const gate = useCallback<Gate>(
    ({ titleName, ...request }) => {
      if (status === "authenticated") {
        // Play with the allowance spent: say so here instead of opening the player.
        const usage = queryClient.getQueryData<UsageSnapshot>(["usage"]);
        if (request.action === "play" && isExhausted(usage)) {
          setLimit(usage!);
          return false;
        }
        return true;
      }
      // While the session is being restored, a session cookie means "signed in".
      if (status === "loading" && hasSessionCookie()) return true;
      const intent: Intent = {
        ...request,
        name: titleName,
        path: `${location.pathname}${location.search}`,
        scroll: Math.round(window.scrollY),
        at: Date.now(),
      };
      saveIntent(intent);
      setOpen({ intent, titleName });
      return false;
    },
    [status, queryClient],
  );
  return (
    <GateContext.Provider value={gate}>
      {children}
      <GateDialog state={open} onClose={() => setOpen(null)} />
      <LimitDialog snapshot={limit} open={!!limit} onClose={() => setLimit(null)} />
      <Suspense>
        <IntentResumer />
      </Suspense>
    </GateContext.Provider>
  );
}

export const useAuthGate = () => useContext(GateContext);

/** Netflix-style "Ready to watch?" sign-in gate (focus-trapped dialog). */
function GateDialog({
  state,
  onClose,
}: {
  state: { intent: Intent; titleName: string } | null;
  onClose: () => void;
}) {
  const next = state ? encodeURIComponent(intentNext(state.intent)) : "";
  const name = <strong className="text-white">{state?.titleName}</strong>;
  const action = state?.intent.action;
  return (
    <Dialog.Root open={!!state} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay asChild>
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[120] bg-black/75"
          />
        </Dialog.Overlay>
        <Dialog.Content
          data-testid="auth-gate"
          className="fixed top-1/2 left-1/2 z-[121] w-[min(440px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 outline-none"
        >
          <m.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="bg-surface relative rounded-md px-7 pt-9 pb-8 text-center shadow-[0_24px_80px_rgb(0_0_0/0.8)] ring-1 ring-white/10 sm:px-10"
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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={BRAND.mark} alt="" className="mx-auto mb-5 size-11" />
            <Dialog.Title className="text-h1 font-black tracking-tight">
              Ready to watch?
            </Dialog.Title>
            <Dialog.Description className="text-body mt-3 text-[#b3b3b3]">
              Create an account or sign in to{" "}
              {action === "my_list" ? (
                <>add {name} to My List.</>
              ) : action === "rate" ? (
                <>rate {name}.</>
              ) : action === "remind" ? (
                <>get a reminder for {name}.</>
              ) : (
                <>start watching {name}.</>
              )}
            </Dialog.Description>
            <div className="mt-7 grid gap-3">
              <Button asChild variant="accent" size="lg" fullWidth className="h-12 rounded">
                <Link href={`/signup?next=${next}`} onClick={onClose}>
                  Create account
                </Link>
              </Button>
              <Button asChild variant="secondary" size="lg" fullWidth className="h-12 rounded">
                <Link href={`/login?next=${next}`} onClick={onClose}>
                  Sign In
                </Link>
              </Button>
            </div>
          </m.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Play anywhere: a link to the player that opens the gate first when signed out. */
export const PlayLink = forwardRef<
  HTMLAnchorElement,
  Omit<React.ComponentProps<typeof Link>, "href"> & {
    slug: string;
    episode?: number | null;
    titleName: string;
  }
>(function PlayLink({ slug, episode, titleName, onClick, ...props }, ref) {
  const gate = useAuthGate();
  return (
    <Link
      ref={ref}
      href={watchPath(slug, episode)}
      onClick={(e) => {
        onClick?.(e);
        if (!e.defaultPrevented && !gate({ action: "play", slug, episode, titleName }))
          e.preventDefault();
      }}
      {...props}
    />
  );
});

/** Intents already handled in this page's lifetime (effects can re-run as the URL settles). */
const handled = new Set<string>();

/**
 * Bring the page back to where the visitor was. Rows load lazily, so wait until the page is
 * tall enough (up to 6 s), and give up as soon as the viewer scrolls by themselves.
 */
function restoreScroll(top: number): void {
  if (top <= 0) return;
  let stop = false;
  const cancel = () => (stop = true);
  const events = ["wheel", "touchstart", "keydown"] as const;
  for (const e of events) window.addEventListener(e, cancel, { once: true, passive: true });
  const started = performance.now();
  let settled = 0;
  const tick = () => {
    if (stop || performance.now() - started > 6000) {
      for (const e of events) window.removeEventListener(e, cancel);
      return;
    }
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (max >= top - 4) {
      if (Math.abs(window.scrollY - top) > 4) {
        window.scrollTo({ top, behavior: "instant" as ScrollBehavior });
        settled = 0;
      } else if (++settled >= 3) {
        stop = true;
      }
    }
    setTimeout(tick, 100);
  };
  tick();
}

const DONE: Record<Exclude<IntentAction, "play">, (name: string) => string> = {
  my_list: (name) => `Added ${name} to My List`,
  rate: (name) => `Rated ${name}`,
  remind: (name) => `We'll let you know when ${name} is out`,
};

/**
 * After login / signup / plan / payment, finish what the visitor started: My List, Rate and
 * Remind run (then the page scrolls back to where they were); Play intents were already the
 * `next` URL, so arriving on the player just clears them.
 */
function IntentResumer() {
  const { status } = useAuth();
  const pathname = usePathname();
  const search = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();

  const perform = useCallback(
    async (intent: Intent) => {
      const id = intent.titleId!;
      const path = { params: { path: { title_id: id } } };
      if (intent.action === "my_list") await unwrap(api.PUT("/api/v1/my-list/{title_id}", path));
      else if (intent.action === "remind")
        await unwrap(api.PUT("/api/v1/reminders/{title_id}", path));
      else if (intent.action === "rate")
        await unwrap(
          api.PUT("/api/v1/ratings/{title_id}", {
            ...path,
            body: { value: intent.value as -1 | 1 | 2 },
          }),
        );
      if (intent.action === "my_list")
        queryClient.setQueryData<Record<number, boolean>>(["in-list"], (v) => ({
          ...(v ?? {}),
          [id]: true,
        }));
      if (intent.action === "rate")
        queryClient.setQueryData<Record<number, number | null>>(["ratings"], (v) => ({
          ...(v ?? {}),
          [id]: intent.value ?? null,
        }));
      void queryClient.invalidateQueries({ queryKey: ["my-list"] });
      void queryClient.invalidateQueries({ queryKey: ["title", intent.slug] });
      void queryClient.invalidateQueries({ queryKey: ["new-and-popular"] });
      void queryClient.invalidateQueries({ queryKey: ["home"], refetchType: "active" });
    },
    [queryClient],
  );

  // One-shot messages carried across a full page load (welcome, plan changes…).
  useEffect(() => {
    const message = takeFlash();
    if (message) toast({ message, tone: "success" }, 4000);
  }, [toast]);

  useEffect(() => {
    if (status !== "authenticated") return;
    const found = pendingIntent({ pathname, search: search.toString() ? `?${search}` : "" });
    if (!found) return;
    const { intent, trusted } = found;
    const key = `${intent.action}:${intent.slug}:${intent.titleId ?? ""}:${intent.value ?? ""}`;
    if (handled.has(key)) return;
    handled.add(key);
    if (intent.action === "play") {
      clearIntent();
      if (!pathname.startsWith("/watch/")) router.replace(watchPath(intent.slug, intent.episode));
      return;
    }
    clearIntent();
    // Drop ?intent= from the address bar so a reload or a shared link doesn't repeat it.
    if (search.has(INTENT_PARAM)) {
      const params = new URLSearchParams(search.toString());
      params.delete(INTENT_PARAM);
      const rest = params.toString();
      window.history.replaceState(null, "", `${pathname}${rest ? `?${rest}` : ""}`);
    }
    const name = intent.name ?? intent.slug.replace(/-/g, " ");
    const run = () =>
      perform(intent)
        .then(() => toast({ message: DONE[intent.action as "my_list"](name), tone: "success" }))
        .catch(() => toast({ message: "Something went wrong. Please try again.", tone: "error" }));
    if (trusted) {
      void run();
      restoreScroll(intent.scroll);
    } else {
      const label =
        intent.action === "my_list"
          ? "Add to My List"
          : intent.action === "remind"
            ? "Remind me"
            : "Rate it";
      toast(
        { message: `Finish what you started with ${name}?`, action: { label, onClick: run } },
        10_000,
      );
    }
  }, [status, pathname, search, perform, router, toast]);

  return null;
}

/** Small helper for components that need the gate as a guard around an action. */
export function useGatedAction() {
  const gate = useAuthGate();
  return useMemo(
    () =>
      (request: GateRequest, action: () => void): void => {
        if (gate(request)) action();
      },
    [gate],
  );
}

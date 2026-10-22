"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { m } from "framer-motion";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { TitlePage } from "@/lib/types";
import { TabBar } from "../browse/tab-bar";
import { TitleView } from "./title-view";

/**
 * Title detail as a modal over the current page. Closing returns to the exact scroll position.
 * Below `lg` it stops above the tab bar (`--tabbar-h`); tapping a tab closes it and navigates.
 * `inline` (deep links): rendered in place instead of a portal, with server data, so the page's
 * HTML already contains the title (what crawlers and no-JS visitors read).
 */
export function TitleModal({
  slug,
  fallbackHref,
  initial,
  inline = false,
}: {
  slug: string;
  fallbackHref?: string;
  initial?: { mode: string; data: TitlePage };
  inline?: boolean;
}) {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [pageScroll] = useState(() => (typeof window === "undefined" ? 0 : window.scrollY));
  const close = () => {
    if (fallbackHref) router.push(fallbackHref, { scroll: false });
    else router.back();
    // Return to exactly where the viewer was, once the route change settles.
    for (const delay of [0, 50, 150, 300])
      setTimeout(() => window.scrollTo({ top: pageScroll }), delay);
  };
  const content = (
    <>
      <Dialog.Overlay asChild>
        <m.div
          initial={inline ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-x-0 top-0 bottom-[var(--tabbar-h)] z-[80] bg-black/70 backdrop-blur-[2px]"
        />
      </Dialog.Overlay>
      <Dialog.Content
        ref={scrollRef}
        aria-describedby={undefined}
        className="fixed inset-x-0 top-0 bottom-[var(--tabbar-h)] z-[81] overflow-y-auto overscroll-contain outline-none md:py-8"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <Dialog.Title className="sr-only">Title details</Dialog.Title>
        <div
          className="min-h-full md:px-6"
          onClick={(e) => e.target === e.currentTarget && close()}
        >
          <m.div
            initial={inline ? false : { opacity: 0, y: 40, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            className="bg-surface relative mx-auto w-full max-w-[900px] overflow-hidden shadow-[0_40px_120px_rgb(0_0_0/0.8)] md:rounded-xl"
          >
            <TitleView
              slug={slug}
              onClose={close}
              scrollParent={scrollRef}
              initial={initial}
              asPage={inline}
            />
          </m.div>
        </div>
        {/* Phones: the tab bar stays one tap away. It's part of the dialog (focusable, not made
            inert by it) and sits exactly over the page's own bar, which the modal stops above. */}
        <TabBar inModal />
      </Dialog.Content>
    </>
  );
  return (
    <Dialog.Root open onOpenChange={(open) => !open && close()}>
      {inline ? content : <Dialog.Portal>{content}</Dialog.Portal>}
    </Dialog.Root>
  );
}

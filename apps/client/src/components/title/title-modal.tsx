"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useRef } from "react";
import { TitleView } from "./title-view";

/** Title detail as a modal over the current page. Closing returns to the exact scroll position. */
export function TitleModal({ slug, fallbackHref }: { slug: string; fallbackHref?: string }) {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const close = () => {
    if (fallbackHref) router.push(fallbackHref, { scroll: false });
    else router.back();
  };
  return (
    <Dialog.Root open onOpenChange={(open) => !open && close()}>
      <Dialog.Portal>
        <Dialog.Overlay asChild>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-[2px]" />
        </Dialog.Overlay>
        <Dialog.Content
          ref={scrollRef}
          aria-describedby={undefined}
          className="fixed inset-0 z-[81] overflow-y-auto overscroll-contain outline-none md:py-8"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <Dialog.Title className="sr-only">Title details</Dialog.Title>
          <div className="min-h-full md:px-6" onClick={(e) => e.target === e.currentTarget && close()}>
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
              className="relative mx-auto w-full max-w-[900px] overflow-hidden bg-surface shadow-[0_40px_120px_rgb(0_0_0/0.8)] md:rounded-xl"
            >
              <TitleView slug={slug} onClose={close} scrollParent={scrollRef} />
            </motion.div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

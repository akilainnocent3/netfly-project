"use client";

import { cn } from "@netfly/ui";
import { motion } from "framer-motion";
import type { TranslationMode } from "@/lib/types";
import { useTranslation } from "@/stores/translation";
import { useConfig } from "../providers/config";

/** Fixed, top-center segmented switcher. Always visible on browse screens. */
export function TranslationSwitcher({ compact }: { compact?: boolean }) {
  const config = useConfig();
  const { mode, set } = useTranslation();
  const options: Array<{ value: TranslationMode; label: string; short: string }> = [
    { value: "translated", label: "Translated", short: "Translated" },
    { value: "not_translated", label: "Not Translated", short: "Original" },
  ];
  if (config.bool("features.translation_filter_allow_all")) options.push({ value: "all", label: "All", short: "All" });

  return (
    <div
      role="radiogroup"
      aria-label="Translation filter"
      className={cn(
        "relative flex items-center rounded-full border border-white/12 bg-black/45 p-1 shadow-[0_8px_30px_rgb(0_0_0/0.35)] backdrop-blur-xl",
        compact ? "text-[12px]" : "text-[13px]",
      )}
      onKeyDown={(e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        e.preventDefault();
        const i = options.findIndex((o) => o.value === mode);
        const next = options[(i + (e.key === "ArrowRight" ? 1 : options.length - 1)) % options.length];
        if (next) set(next.value);
      }}
    >
      {options.map((option) => {
        const active = option.value === mode;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => set(option.value)}
            className={cn(
              "relative z-10 whitespace-nowrap rounded-full font-semibold transition-colors duration-200",
              compact ? "px-3 py-1.5" : "px-4 py-1.5",
              active ? "text-accent-fg" : "text-white/70 hover:text-white",
            )}
          >
            {active && (
              <motion.span
                layoutId="translation-indicator"
                className="absolute inset-0 -z-10 rounded-full bg-accent shadow-[0_0_20px_rgb(var(--accent-rgb)/0.45)]"
                transition={{ type: "spring", stiffness: 500, damping: 38 }}
              />
            )}
            <span className="hidden sm:inline">{option.label}</span>
            <span className="sm:hidden">{option.short}</span>
          </button>
        );
      })}
    </div>
  );
}

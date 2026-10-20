"use client";

import type { TranslationMode } from "@/lib/types";
import { useTranslation } from "@/stores/translation";
import { useConfig } from "../providers/config";
import { SegmentedControl } from "../ui/segmented";

/** Fixed, top-center segmented switcher. Always visible on browse screens. */
export function TranslationSwitcher({ compact }: { compact?: boolean }) {
  const config = useConfig();
  const { mode, set } = useTranslation();
  const options: Array<{ value: TranslationMode; label: React.ReactNode }> = [
    {
      value: "translated",
      label: "Translated",
    },
    {
      value: "not_translated",
      label: (
        <>
          <span className="hidden sm:inline">Not Translated</span>
          <span className="sm:hidden">Original</span>
        </>
      ),
    },
  ];
  if (config.bool("features.translation_filter_allow_all"))
    options.push({ value: "all", label: "All" });
  return (
    <SegmentedControl
      label="Translation filter"
      options={options}
      value={mode}
      onChange={set}
      size={compact ? "sm" : "md"}
      className="shadow-[0_8px_30px_rgb(0_0_0/0.35)]"
    />
  );
}

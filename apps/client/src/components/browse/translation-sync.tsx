"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { api } from "@/lib/api";
import type { TranslationMode } from "@/lib/types";
import { storedMode, useTranslation } from "@/stores/translation";
import { useAuth } from "../providers/auth";
import { useConfig } from "../providers/config";

const VALID = new Set<TranslationMode>(["translated", "not_translated", "all"]);

/** Resolves the initial mode (URL → this browser → account → configured default) and keeps all three in sync. */
export function TranslationSync() {
  const config = useConfig();
  const { user, status } = useAuth();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { mode, init } = useTranslation();
  const lastSaved = useRef<string | null>(null);
  const allowAll = config.bool("features.translation_filter_allow_all");

  useEffect(() => {
    if (mode !== null || status === "loading") return;
    const ok = (m: string | null | undefined): m is TranslationMode => !!m && VALID.has(m as TranslationMode) && (m !== "all" || allowAll);
    const fromUrl = params.get("translation");
    const candidates = [fromUrl, storedMode(), user?.translation_mode, config.str("content.default_translation_mode", "translated")];
    const resolved = candidates.find(ok) ?? "translated";
    lastSaved.current = user?.translation_mode ?? null;
    init(resolved);
  }, [mode, status, params, user, config, allowAll, init]);

  // Reflect the mode in the URL (shareable) and on the account (follows the viewer across devices).
  useEffect(() => {
    if (!mode) return;
    if (params.get("translation") !== mode) {
      const next = new URLSearchParams(params.toString());
      next.set("translation", mode);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    }
    if (user && lastSaved.current !== mode) {
      lastSaved.current = mode;
      void api.PATCH("/api/v1/auth/me", { body: { translation_mode: mode } });
    }
  }, [mode, params, pathname, router, user]);

  return null;
}

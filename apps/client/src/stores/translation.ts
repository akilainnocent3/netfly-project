"use client";

import { create } from "zustand";
import type { TranslationMode } from "@/lib/types";

const STORAGE_KEY = "netfly-translation";
export const MODE_COOKIE = "netfly_tr";

function persist(mode: TranslationMode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* storage unavailable */
  }
  document.cookie = `${MODE_COOKIE}=${mode}; path=/; max-age=31536000; samesite=lax`;
}

export function storedMode(): TranslationMode | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "translated" || value === "not_translated" || value === "all" ? value : null;
  } catch {
    return null;
  }
}

interface TranslationStore {
  mode: TranslationMode | null;
  /** Called once on boot with the resolved initial mode (URL → storage → server pref → default). */
  init: (mode: TranslationMode) => void;
  set: (mode: TranslationMode) => void;
}

/** The global Translated / Not Translated filter. Every catalog query keys on it. */
export const useTranslation = create<TranslationStore>((set) => ({
  mode: null,
  init: (mode) => {
    persist(mode);
    set({ mode });
  },
  set: (mode) => {
    persist(mode);
    set({ mode });
  },
}));

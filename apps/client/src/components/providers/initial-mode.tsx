"use client";

import { createContext, useContext } from "react";
import type { TranslationMode } from "@/lib/types";

/** The mode resolved on the server (cookie → configured default), so the first render can fetch at once. */
const InitialModeContext = createContext<TranslationMode>("translated");

export function InitialModeProvider({
  value,
  children,
}: {
  value: TranslationMode;
  children: React.ReactNode;
}) {
  return <InitialModeContext.Provider value={value}>{children}</InitialModeContext.Provider>;
}

export function useInitialMode(): TranslationMode {
  return useContext(InitialModeContext);
}

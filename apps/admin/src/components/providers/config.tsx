"use client";

import { bool, num, str, type PublicConfig } from "@netfly/ui";
import { createContext, useContext, useMemo } from "react";

const ConfigContext = createContext<PublicConfig>({});

export function ConfigProvider({ value, children }: { value: PublicConfig; children: React.ReactNode }) {
  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}

/** Typed accessors over the public DB config. */
export function useConfig() {
  const config = useContext(ConfigContext);
  return useMemo(
    () => ({
      raw: config,
      str: (key: string, fallback = "") => str(config, key, fallback),
      num: (key: string, fallback = 0) => num(config, key, fallback),
      bool: (key: string, fallback = false) => bool(config, key, fallback),
      list: (key: string): string[] => {
        const value = config[key];
        return Array.isArray(value) ? value.map(String) : [];
      },
    }),
    [config],
  );
}

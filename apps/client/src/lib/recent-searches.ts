"use client";

import { api } from "./api";

const MAX = 8;
const key = () => `netfly_recent_searches:${api.session.profileId ?? "account"}`;

/** Recent searches live on this device (per profile), newest first. */
export function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(key());
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((q): q is string => typeof q === "string") : [];
  } catch {
    return [];
  }
}

export function pushRecent(q: string): string[] {
  const query = q.trim();
  if (!query) return readRecent();
  const next = [
    query,
    ...readRecent().filter((r) => r.toLowerCase() !== query.toLowerCase()),
  ].slice(0, MAX);
  try {
    localStorage.setItem(key(), JSON.stringify(next));
  } catch {
    // Storage unavailable: recent searches just aren't remembered.
  }
  return next;
}

export function clearRecent(): void {
  try {
    localStorage.removeItem(key());
  } catch {
    // ignore
  }
}

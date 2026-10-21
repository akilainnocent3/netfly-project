/** One-shot messages that survive a full page load (e.g. "Welcome to NETFLY" after signup). */
const KEY = "netfly-flash";

export function setFlash(message: string): void {
  try {
    sessionStorage.setItem(KEY, message.slice(0, 200));
  } catch {
    /* ignore */
  }
}

export function takeFlash(): string | null {
  try {
    const value = sessionStorage.getItem(KEY);
    if (value) sessionStorage.removeItem(KEY);
    return value;
  } catch {
    return null;
  }
}

import { safeNext } from "./safe-next";

/**
 * Leave the auth / plan / payment flow for `next` with a full page load: the destination is
 * rendered fresh with the new session, and app routes that intercept (the title modal) never
 * see a soft navigation from outside their layout.
 */
export function goAfterAuth(next: string | null | undefined): void {
  window.location.replace(safeNext(next));
}

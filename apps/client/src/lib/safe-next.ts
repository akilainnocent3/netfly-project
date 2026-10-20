/** Only allow same-site relative redirects after login. */
export function safeNext(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/browse";
  return value;
}

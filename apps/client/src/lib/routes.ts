/** Need an account: middleware sends signed-out visitors to /login?next=… (Play etc. open the gate first). */
export const PRIVATE_PATHS = [
  "/watch",
  "/account",
  "/my-list",
  "/signup/plan",
  "/verify",
  "/payment",
];

/** The app itself: open to everyone, but not for search engines (robots.txt + X-Robots-Tag). */
export const APP_PATHS = [
  "/browse",
  "/series",
  "/films",
  "/new-and-popular",
  "/search",
  "/categories",
];

export const NOINDEX_PATHS = [...PRIVATE_PATHS, ...APP_PATHS];

export const matchesPath = (pathname: string, paths: string[]) =>
  paths.some((p) => pathname === p || pathname.startsWith(`${p}/`));

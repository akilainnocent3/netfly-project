/** Signed-in-only app routes: middleware redirects signed-out visitors, robots.txt disallows them. */
export const PRIVATE_PATHS = [
  "/browse",
  "/series",
  "/films",
  "/new-and-popular",
  "/my-list",
  "/account",
  "/search",
  "/categories",
  "/watch",
];

export const matchesPath = (pathname: string, paths: string[]) =>
  paths.some((p) => pathname === p || pathname.startsWith(`${p}/`));

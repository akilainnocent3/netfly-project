import { LogoLoader } from "@netfly/ui";

/**
 * Fallback for route transitions (`loading.tsx`): the brand loader filling the content area.
 * The layout's header and tab bar stay in place; the loader appears only after its CSS delay,
 * so fast navigations show nothing.
 */
export function RouteLoading({ immersive = false }: { immersive?: boolean }) {
  if (immersive)
    return (
      <main className="fixed inset-0 grid place-items-center bg-black" aria-busy>
        <LogoLoader size="lg" />
      </main>
    );
  return (
    <div className="grid min-h-dvh place-items-center pt-[var(--header-h)]" aria-busy>
      <LogoLoader size="lg" />
    </div>
  );
}

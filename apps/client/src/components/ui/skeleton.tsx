import { cn, LazyLogoLoader } from "@netfly/ui";

/** Content-shaped placeholder. */
export function Skeleton({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return <div aria-hidden className={cn("skeleton rounded-md", className)} style={style} />;
}

/**
 * Skeletons (which reserve the layout, so nothing shifts) with one brand loader centred over
 * them. Use it for the first placeholder block of a page or panel only, never per card.
 */
export function SkeletonArea({
  children,
  className,
  loaderClassName,
  label,
}: {
  children: React.ReactNode;
  className?: string;
  loaderClassName?: string;
  label?: string;
}) {
  return (
    <div aria-busy className={cn("relative", className)}>
      <div aria-hidden>{children}</div>
      <div className={cn("absolute inset-0 grid place-items-center", loaderClassName)}>
        <LazyLogoLoader size="md" label={label} />
      </div>
    </div>
  );
}

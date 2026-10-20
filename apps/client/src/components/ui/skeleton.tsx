import { cn } from "@netfly/ui";

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

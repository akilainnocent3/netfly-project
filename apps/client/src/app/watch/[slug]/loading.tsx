import { RouteLoading } from "@/components/ui/route-loading";

// The player is immersive: no header or tab bar, black like the player itself.
export default function Loading() {
  return <RouteLoading immersive />;
}

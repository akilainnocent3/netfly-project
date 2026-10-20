import "server-only";
import type { PublicConfig } from "@netfly/ui";

const API = process.env.NETFLY_API_URL ?? "http://localhost:8000";

/** Public config (branding, flags, player defaults) for server rendering. */
export async function getPublicConfig(): Promise<PublicConfig> {
  try {
    const res = await fetch(`${API}/api/public/config`, { next: { revalidate: 15 } });
    if (!res.ok) return {};
    const body = (await res.json()) as { values: PublicConfig };
    return body.values;
  } catch {
    return {};
  }
}

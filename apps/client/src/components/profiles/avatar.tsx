import { cn } from "@netfly/ui";

// Preset avatars (the API validates the key). Simple geometric faces on brand-safe colours.
const COLORS = [
  "#E50914",
  "#2B6CDF",
  "#F5B301",
  "#1DB954",
  "#8E44AD",
  "#00A8A8",
  "#F26B1D",
  "#D6336C",
  "#5C7CFA",
  "#4C9A2A",
  "#B5179E",
  "#6C757D",
];
const FACES = ["smile", "grin", "wink", "calm"] as const;

function variant(key: string | undefined): { color: string; face: (typeof FACES)[number] } {
  const n = Math.max(1, Number(key?.replace(/\D/g, "") || 1));
  return { color: COLORS[(n - 1) % COLORS.length]!, face: FACES[(n - 1) % FACES.length]! };
}

export function Avatar({
  avatarKey,
  className,
  label,
}: {
  avatarKey?: string;
  className?: string;
  label?: string;
}) {
  const { color, face } = variant(avatarKey);
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("relative block aspect-square overflow-hidden rounded-md", className)}
      style={{ backgroundColor: color }}
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full" aria-hidden>
        <defs>
          <linearGradient id={`g-${avatarKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.18" />
            <stop offset="1" stopColor="#000" stopOpacity="0.18" />
          </linearGradient>
        </defs>
        <rect width="100" height="100" fill={`url(#g-${avatarKey})`} />
        {face === "wink" ? (
          <>
            <circle cx="34" cy="40" r="6" fill="#fff" />
            <path d="M60 40h12" stroke="#fff" strokeWidth="6" strokeLinecap="round" />
          </>
        ) : (
          <>
            <circle cx="34" cy="40" r={face === "calm" ? 4 : 6} fill="#fff" />
            <circle cx="66" cy="40" r={face === "calm" ? 4 : 6} fill="#fff" />
          </>
        )}
        {face === "grin" ? (
          <path d="M26 60q24 26 48 0z" fill="#fff" />
        ) : face === "calm" ? (
          <path d="M34 66h32" stroke="#fff" strokeWidth="6" strokeLinecap="round" />
        ) : (
          <path
            d="M28 60q22 20 44 0"
            stroke="#fff"
            strokeWidth="6"
            fill="none"
            strokeLinecap="round"
          />
        )}
      </svg>
    </span>
  );
}

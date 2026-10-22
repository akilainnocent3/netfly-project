import { useId } from "react";
import { cn } from "./format";
import geometry from "./logo-geometry.json";

/*
 * The NETFLY mark: a red ribbon folded into a rounded diamond. Geometry is traced from the
 * reference artwork by scripts/brand/trace_logo.py (logo-geometry.json, ≥ 99.9 % IoU); the
 * app icons are generated from the same file (scripts/brand/brand-icons.mjs).
 *
 * The ribbon fills with currentColor (so `branding.accent_color` applies); the folds are
 * translucent black gradients clipped to the band. Both components are server-safe; all motion
 * lives in logo-loader.css.
 */

type Layer = (typeof geometry.folds)[number]["layers"][number];

/** Gradient ids must be unique per instance and valid inside url(#…). */
function useSvgId(): string {
  return `nf${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

function Gradient({ id, layer }: { id: string; layer: Layer }) {
  const stops = layer.stops.map(([offset, opacity]) => (
    <stop key={offset} offset={offset} stopOpacity={opacity} />
  ));
  return "cx" in layer ? (
    <radialGradient id={id} gradientUnits="userSpaceOnUse" cx={layer.cx} cy={layer.cy} r={layer.r}>
      {stops}
    </radialGradient>
  ) : (
    <linearGradient
      id={id}
      gradientUnits="userSpaceOnUse"
      x1={layer.x1}
      y1={layer.y1}
      x2={layer.x2}
      y2={layer.y2}
    >
      {stops}
    </linearGradient>
  );
}

function Defs({ id }: { id: string }) {
  return (
    <>
      <clipPath id={`${id}-band`}>
        <path d={geometry.band} clipRule="evenodd" />
      </clipPath>
      {geometry.folds.map((fold, i) =>
        fold.layers.map((layer, j) => (
          <Gradient key={`${i}${j}`} id={`${id}-f${i}${j}`} layer={layer} />
        )),
      )}
      {/* Light sheen, top-left to bottom-right (local x runs down-right on screen). */}
      <linearGradient id={`${id}-sheen`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#fff" stopOpacity=".045" />
        <stop offset=".5" stopColor="#fff" stopOpacity="0" />
        <stop offset="1" stopOpacity=".05" />
      </linearGradient>
    </>
  );
}

function Folds({ id }: { id: string }) {
  return geometry.folds.map((fold, i) =>
    fold.layers.map((_, j) => <path key={`${i}${j}`} d={fold.d} fill={`url(#${id}-f${i}${j})`} />),
  );
}

export interface LogoMarkProps {
  /** Accessible name; without one the mark is decorative (aria-hidden). */
  title?: string;
  className?: string;
  style?: React.CSSProperties;
}

/** The static mark. Size it with CSS (e.g. `size-8`); colour with `color`. */
export function LogoMark({ title, className, style }: LogoMarkProps) {
  const id = useSvgId();
  return (
    <svg
      viewBox={geometry.viewBox}
      className={cn("nf-mark", className)}
      style={style}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <Defs id={id} />
      </defs>
      <g transform={geometry.transform} fill="currentColor">
        <path d={geometry.band} fillRule="evenodd" />
        <g clipPath={`url(#${id}-band)`}>
          <Folds id={id} />
        </g>
        <path d={geometry.band} fillRule="evenodd" fill={`url(#${id}-sheen)`} />
      </g>
    </svg>
  );
}

export type LogoLoaderSize = "sm" | "md" | "lg";

export interface LogoLoaderProps {
  /** sm 20 px (inline in buttons and text), md 48 px (sections), lg 96 px (full screen, player). */
  size?: LogoLoaderSize;
  /** What is loading, for screen readers. */
  label?: string;
  /** Also show the label under the mark (lg only). */
  showLabel?: boolean;
  /**
   * Inside a region that is already announced as busy: render no status role and hide the
   * loader from assistive technology.
   */
  decorative?: boolean;
  /** Milliseconds before the loader appears, so fast loads show nothing. */
  delay?: number;
  /** Play the 150 ms exit fade (set by useLoaderPresence / LoaderPresence). */
  exiting?: boolean;
  className?: string;
}

// Stacked dashes (length, opacity) along the centre line make one soft-edged highlight.
// pathLength is 100; `--lag` centres each dash on the same point (see logo-loader.css).
const LOOP_MS = 1600;
const LIGHT: Array<[number, number]> = [
  [28, 0.05],
  [21, 0.06],
  [15, 0.07],
  [9, 0.08],
  [4, 0.09],
];
const LONGEST = LIGHT[0]![0];

/**
 * The animated brand loader. Pure CSS (works in server HTML and `loading.tsx`): it waits
 * `delay` ms, fades in while the ribbon draws on, then a light runs along the ribbon. Respects
 * prefers-reduced-motion (a slow opacity pulse only). For a minimum on-screen time and an exit
 * fade, use <LoaderPresence>.
 */
export function LogoLoader({
  size = "md",
  label = "Loading…",
  showLabel = false,
  decorative = false,
  delay = 200,
  exiting = false,
  className,
}: LogoLoaderProps) {
  const id = useSvgId();
  const visibleLabel = showLabel && size === "lg";
  return (
    <span
      className={cn("nf-loader", className)}
      data-size={size}
      data-exiting={exiting || undefined}
      role={decorative ? undefined : "status"}
      aria-live={decorative ? undefined : "polite"}
      aria-hidden={decorative || undefined}
      style={{ "--nf-delay": `${delay}ms` } as React.CSSProperties}
    >
      <span className="nf-loader__art">
        <svg viewBox={geometry.viewBox} aria-hidden="true" focusable="false">
          <defs>
            <Defs id={id} />
            <mask
              id={`${id}-draw`}
              maskUnits="userSpaceOnUse"
              x="-60"
              y="-60"
              width="120"
              height="120"
            >
              <path
                className="nf-loader__draw"
                d={geometry.centerLine}
                pathLength={100}
                fill="none"
                stroke="#fff"
                strokeWidth={geometry.bandWidth + 8}
              />
            </mask>
          </defs>
          <g transform={geometry.transform} fill="currentColor">
            <g mask={`url(#${id}-draw)`}>
              <path d={geometry.band} fillRule="evenodd" />
              <g clipPath={`url(#${id}-band)`}>
                {LIGHT.map(([length, opacity]) => (
                  <path
                    key={length}
                    className="nf-loader__light"
                    d={geometry.centerLine}
                    pathLength={100}
                    fill="none"
                    stroke="#fff"
                    strokeOpacity={opacity}
                    strokeWidth={geometry.bandWidth + 4}
                    strokeDasharray={`${length} ${100 - length}`}
                    style={
                      {
                        "--lag": `${(-(LONGEST - length) / 2 / 100) * LOOP_MS}ms`,
                      } as React.CSSProperties
                    }
                  />
                ))}
                <Folds id={id} />
                {geometry.folds.map((fold) => (
                  <path
                    key={fold.d}
                    className="nf-loader__deepen"
                    d={fold.d}
                    fill="#000"
                    fillOpacity={0.22}
                  />
                ))}
              </g>
              <path d={geometry.band} fillRule="evenodd" fill={`url(#${id}-sheen)`} />
            </g>
          </g>
        </svg>
      </span>
      {visibleLabel ? (
        <span className="nf-loader__label">{label}</span>
      ) : decorative ? null : (
        <span className="nf-sr">{label}</span>
      )}
    </span>
  );
}

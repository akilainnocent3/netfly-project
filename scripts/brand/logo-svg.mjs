// Standalone SVG markup for the NETFLY mark, built from packages/ui/src/logo-geometry.json
// (the same geometry <LogoMark> renders). Used by brand-icons.mjs and verify-logo.mjs.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

export const root = fileURLToPath(new URL("../../", import.meta.url));
export const geometry = JSON.parse(
  readFileSync(new URL("../../packages/ui/src/logo-geometry.json", import.meta.url), "utf8"),
);

/** Playwright lives in the e2e workspace; resolve it from there. */
export function loadPlaywright() {
  return createRequire(new URL("../../e2e/package.json", import.meta.url))("@playwright/test");
}

function layer(id, l) {
  const stops = l.stops
    .map(([offset, opacity]) => `<stop offset="${offset}" stop-opacity="${opacity}"/>`)
    .join("");
  return l.type === "linear"
    ? `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}">${stops}</linearGradient>`
    : `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${l.cx}" cy="${l.cy}" r="${l.r}">${stops}</radialGradient>`;
}

/**
 * @param {{ color?: string, background?: string, padding?: number, size?: number, sheen?: boolean }} options
 *   padding: fraction of the canvas left empty on each side (the mark fills the rest).
 */
export function logoSvg({ color = geometry.color, background, padding = 0, size, sheen = true } = {}) {
  const g = geometry;
  const defs = [`<clipPath id="b"><path d="${g.band}" clip-rule="evenodd"/></clipPath>`];
  const folds = [];
  g.folds.forEach((fold, i) =>
    fold.layers.forEach((l, j) => {
      defs.push(layer(`f${i}${j}`, l));
      folds.push(`<path d="${fold.d}" fill="url(#f${i}${j})"/>`);
    }),
  );
  if (sheen) {
    defs.push(
      `<linearGradient id="s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".045"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-opacity=".05"/></linearGradient>`,
    );
  }
  // The 100-unit viewBox holds the mark edge to edge; widen it to add padding around it.
  const pad = (100 * padding) / (1 - 2 * padding);
  const vb = `${-pad} ${-pad} ${100 + 2 * pad} ${100 + 2 * pad}`;
  const dims = size ? ` width="${size}" height="${size}"` : "";
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"${dims}>`,
    `<defs>${defs.join("")}</defs>`,
    background ? `<rect x="${-pad}" y="${-pad}" width="${100 + 2 * pad}" height="${100 + 2 * pad}" fill="${background}"/>` : "",
    `<g transform="${g.transform}" fill="${color}">`,
    `<path d="${g.band}" fill-rule="evenodd"/>`,
    `<g clip-path="url(#b)">${folds.join("")}</g>`,
    sheen ? `<path d="${g.band}" fill-rule="evenodd" fill="url(#s)"/>` : "",
    `</g></svg>`,
  ].join("");
}

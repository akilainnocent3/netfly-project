// Rebuild every app icon and brand SVG from the traced mark (packages/ui/src/logo-geometry.json).
//   node scripts/brand/brand-icons.mjs
//
// Per app (client, admin):
//   icon.svg, favicon.ico (16/32/48), apple-icon.png (180, on #141414), served at the site root.
//     Studio uses Next's file conventions (src/app/). The viewer app serves them from public/ and
//     lists them in its metadata instead, because file-convention icons always win over
//     metadata and `branding.favicon_url` must be able to override them.
//   public/brand/icon-{192,512}.v2.png and icon-maskable-{192,512}.v2.png (20 % safe padding)
//     — referenced by app/manifest.ts
//   public/brand/netfly-{logo,logo-on-light,mark}.v2.svg — the wordmark with the traced mark
// Brand files are cached as immutable, so a visual change needs a new version in the name.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadPlaywright, logoSvg, root } from "./logo-svg.mjs";

const BG = "#141414";
const VERSION = "v2";
const APPS = { client: "public", admin: "src/app" }; // where each app's root icons live

const { chromium } = loadPlaywright();
const browser = await chromium.launch();
const page = await browser.newPage();

/** Rasterise an SVG string to a square PNG (transparent where the SVG is). */
async function png(svg, size) {
  await page.setViewportSize({ width: size, height: size });
  const uri = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  await page.setContent(
    `<html><body style="margin:0;background:transparent"><img src="${uri}" width="${size}" height="${size}" style="display:block"></body></html>`,
  );
  await page.locator("img").evaluate((img) => img.decode());
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}

/** An .ico holding PNG images (supported by every current browser and by Windows). */
function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, e);
    header.writeUInt8(size >= 256 ? 0 : size, e + 1);
    header.writeUInt8(0, e + 2); // palette
    header.writeUInt8(0, e + 3);
    header.writeUInt16LE(1, e + 4); // colour planes
    header.writeUInt16LE(32, e + 6); // bits per pixel
    header.writeUInt32LE(data.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map((i) => i.data)]);
}

/** The wordmark: the traced mark beside the NETFLY letters (wordmark-letters.svg). */
function wordmark(textFill) {
  const letters = readFileSync(new URL("./wordmark-letters.svg", import.meta.url), "utf8")
    .trim()
    .replace("#FFFFFF", textFill);
  const mark = logoSvg()
    .replace("<svg ", '<svg x="4" y="-11" width="122" height="122" ')
    .replace(/ xmlns="[^"]+"/, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-12 -35 782.8662790697675 170"><title>NETFLY</title>${mark}${letters}</svg>`;
}

function write(path, data) {
  const full = join(root, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, data);
  console.log(`wrote ${path} (${data.length} B)`);
}

// Small sizes drop the sheen (invisible there) and keep a hair of padding for antialiasing.
const favicon = ico(
  await Promise.all(
    [16, 32, 48].map(async (size) => ({
      size,
      data: await png(logoSvg({ padding: 0.03, sheen: size > 32 }), size),
    })),
  ),
);
const rootIcons = {
  "icon.svg": logoSvg({ padding: 0.03 }),
  "favicon.ico": favicon,
  "apple-icon.png": await png(logoSvg({ background: BG, padding: 0.16 }), 180),
};
const files = {
  [`public/brand/icon-192.${VERSION}.png`]: await png(logoSvg({ background: BG, padding: 0.14 }), 192),
  [`public/brand/icon-512.${VERSION}.png`]: await png(logoSvg({ background: BG, padding: 0.14 }), 512),
  // Maskable: the platform may crop to a circle of 80 % diameter; keep the mark inside it.
  [`public/brand/icon-maskable-192.${VERSION}.png`]: await png(logoSvg({ background: BG, padding: 0.2 }), 192),
  [`public/brand/icon-maskable-512.${VERSION}.png`]: await png(logoSvg({ background: BG, padding: 0.2 }), 512),
  [`public/brand/netfly-logo.${VERSION}.svg`]: wordmark("#FFFFFF"),
  [`public/brand/netfly-logo-on-light.${VERSION}.svg`]: wordmark("#141414"),
  [`public/brand/netfly-mark.${VERSION}.svg`]: logoSvg().replace(">", "><title>NETFLY</title>"),
};
for (const [app, iconDir] of Object.entries(APPS)) {
  for (const [path, data] of Object.entries(rootIcons)) write(`apps/${app}/${iconDir}/${path}`, data);
  for (const [path, data] of Object.entries(files)) write(`apps/${app}/${path}`, data);
}
await browser.close();

// Render the traced mark in Chromium at the reference size and diff it against the artwork.
//   node scripts/brand/verify-logo.mjs [--diff out.png]
// Prints IoU of the red mask (target ≥ 0.98) and the mean colour error inside the band.
import { readFileSync, writeFileSync } from "node:fs";
import { geometry, loadPlaywright, logoSvg, root } from "./logo-svg.mjs";

const { chromium } = loadPlaywright();
const ref = geometry.reference;
const reference = readFileSync(`${root}/${geometry.source}`).toString("base64");
// No sheen: the artwork is flat red; the sheen is a deliberate on-screen addition.
const svg = Buffer.from(logoSvg({ sheen: false, size: ref.scale * 100 })).toString("base64");

const browser = await chromium.launch();
const page = await browser.newPage();
const result = await page.evaluate(
  async ({ reference, svg, ref, wantDiff }) => {
    const load = (src) =>
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
      });
    const pixels = (draw) => {
      const c = new OffscreenCanvas(ref.size, ref.size);
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, ref.size, ref.size);
      draw(ctx);
      return ctx.getImageData(0, 0, ref.size, ref.size).data;
    };
    const a = pixels(async () => {});
    const refImg = await load(`data:image/png;base64,${reference}`);
    const svgImg = await load(`data:image/svg+xml;base64,${svg}`);
    const A = pixels((ctx) => ctx.drawImage(refImg, 0, 0));
    const B = pixels((ctx) => ctx.drawImage(svgImg, ref.x, ref.y, ref.scale * 100, ref.scale * 100));
    void a;
    const isRed = (d, i) => d[i] > 60 && d[i] > d[i + 1] * 2;
    let inter = 0, union = 0, err = 0, n = 0;
    const diff = wantDiff ? new Uint8ClampedArray(A.length) : null;
    for (let i = 0; i < A.length; i += 4) {
      const ra = isRed(A, i), rb = isRed(B, i);
      if (ra && rb) {
        inter++;
        err += Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]);
        n++;
      }
      if (ra || rb) union++;
      if (diff) {
        diff[i] = ra && !rb ? 255 : 0;
        diff[i + 1] = rb && !ra ? 255 : 0;
        diff[i + 2] = ra && rb ? Math.min(255, 4 * Math.abs(A[i] - B[i])) : 0;
        diff[i + 3] = 255;
      }
    }
    let png = null;
    if (diff) {
      const c = new OffscreenCanvas(ref.size, ref.size);
      c.getContext("2d").putImageData(new ImageData(diff, ref.size), 0, 0);
      const blob = await c.convertToBlob({ type: "image/png" });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let s = "";
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      png = btoa(s);
    }
    return { iou: inter / union, meanColourError: err / n / 3, png };
  },
  { reference, svg, ref, wantDiff: process.argv.includes("--diff") },
);
await browser.close();

console.log(`IoU ${(result.iou * 100).toFixed(2)} %  ·  mean colour error ${result.meanColourError.toFixed(2)} / 255 per channel`);
if (result.png) {
  const out = process.argv[process.argv.indexOf("--diff") + 1];
  writeFileSync(out, Buffer.from(result.png, "base64"));
  console.log(`diff written to ${out} (red: artwork only, green: SVG only, blue: colour error ×4)`);
}
process.exit(result.iou >= 0.98 ? 0 : 1);

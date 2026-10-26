/**
 * Studio → Video extraction, end to end, against a small fixture site served by this test:
 * crawl it, check an MP4 (plays, and the preview plays), an X-Frame-Options page (No), confirm
 * the MP4 (rights checkbox required), find it under Approved embeds, revoke it. Plus axe.
 *
 * The crawler refuses private addresses (decision 67). The fixture's host:port is allowed through
 * `extraction.test_hosts`, which the API honours only while test mode is on (global setup).
 * Where the extraction worker runs in a container on a bridge network, set
 * NETFLY_E2E_FIXTURE_HOST (e.g. host.docker.internal) so it can reach this machine.
 */
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import type { Page } from "@playwright/test";
import { adminApi, expect, setConfig, test } from "./helpers";

const ADMIN = process.env.NETFLY_ADMIN_URL ?? "http://localhost:3001";
const FIXTURE_HOST = process.env.NETFLY_E2E_FIXTURE_HOST ?? "127.0.0.1";
const CLIP = readFileSync(path.join(__dirname, "..", "fixtures", "extraction", "clip.mp4"));

test.describe.configure({ mode: "serial" });

let server: Server;
let origin = "";
const createdEmbeds: number[] = [];

function page(title: string, body: string, head = ""): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title>${head}</head><body>${body}</body></html>`;
}

function fixtureSite(req: { url?: string; headers: Record<string, unknown> }) {
  const url = new URL(req.url ?? "/", origin);
  const cors = { "access-control-allow-origin": "*" };
  const html = (body: string, headers: Record<string, string> = {}) => ({
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", ...headers },
    body: Buffer.from(body),
  });
  switch (url.pathname) {
    case "/":
      return html(
        page(
          "Fixture films",
          `<h1>Fixture films</h1>
           <a href="/watch">Watch the clip</a> <a href="/stream">Live stream</a>
           <a href="/locked">Members only</a> <a href="/provider">Provider video</a>
           <img src="/poster.png" alt="">`,
        ),
      );
    case "/watch":
      return html(
        page(
          "Watch the clip",
          `<video controls src="/media/clip.mp4"></video>`,
          `<meta property="og:description" content="A three-second test pattern, free to embed.">`,
        ),
      );
    case "/stream":
      return html(
        page("Live stream", `<video data-src="/hls/master.m3u8"></video><a href="/">home</a>`),
      );
    case "/locked":
      return html(page("Members only", "<p>Sign in to watch.</p>"), {
        "x-frame-options": "SAMEORIGIN",
      });
    case "/provider":
      return html(
        page(
          "Provider video",
          "<p>Hosted by a provider</p>",
          `<link rel="alternate" type="application/json+oembed" href="/oembed?url=${encodeURIComponent(`${origin}/provider`)}">`,
        ),
      );
    case "/oembed":
      return {
        status: 200,
        headers: { "content-type": "application/json" },
        body: Buffer.from(
          JSON.stringify({
            type: "video",
            version: "1.0",
            provider_name: "Fixture Player",
            title: "Provider clip",
            width: 640,
            height: 360,
            html: `<iframe src="${origin}/player/1" width="640" height="360" allowfullscreen></iframe>`,
          }),
        ),
      };
    case "/player/1":
      return html(page("Player", `<video controls src="/media/clip.mp4"></video>`));
    case "/media/clip.mp4": {
      const range = /bytes=(\d+)-(\d*)/.exec(String(req.headers["range"] ?? ""));
      if (range) {
        const start = Number(range[1]);
        const end = Math.min(range[2] ? Number(range[2]) : CLIP.length - 1, CLIP.length - 1);
        return {
          status: 206,
          headers: {
            ...cors,
            "content-type": "video/mp4",
            "accept-ranges": "bytes",
            "content-range": `bytes ${start}-${end}/${CLIP.length}`,
          },
          body: CLIP.subarray(start, end + 1),
        };
      }
      return {
        status: 200,
        headers: { ...cors, "content-type": "video/mp4", "accept-ranges": "bytes" },
        body: CLIP,
      };
    }
    case "/hls/master.m3u8":
      return {
        status: 200,
        headers: { ...cors, "content-type": "application/vnd.apple.mpegurl" },
        body: Buffer.from(
          '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=300000,RESOLUTION=320x180,CODECS="avc1.42c00d"\nv0/index.m3u8\n',
        ),
      };
    case "/hls/v0/index.m3u8":
      return {
        status: 200,
        headers: { ...cors, "content-type": "application/vnd.apple.mpegurl" },
        body: Buffer.from(
          "#EXTM3U\n#EXT-X-TARGETDURATION:3\n#EXTINF:3.0,\nseg0.ts\n#EXT-X-ENDLIST\n",
        ),
      };
    case "/hls/v0/seg0.ts":
      return {
        status: 200,
        headers: { ...cors, "content-type": "video/mp2t" },
        body: Buffer.alloc(188 * 4, 0x47),
      };
    case "/robots.txt":
      return {
        status: 200,
        headers: { "content-type": "text/plain" },
        body: Buffer.from("User-agent: *\nAllow: /\n"),
      };
    default:
      return { status: 404, headers: { "content-type": "text/html" }, body: Buffer.from("nope") };
  }
}

test.beforeAll(async () => {
  server = createServer((req, res) => {
    const out = fixtureSite(req);
    res.writeHead(out.status, { ...out.headers, "content-length": String(out.body.length) });
    res.end(req.method === "HEAD" ? undefined : out.body);
  });
  await new Promise<void>((resolve) => server.listen(0, "0.0.0.0", resolve));
  const { port } = server.address() as AddressInfo;
  origin = `http://${FIXTURE_HOST}:${port}`;
  await setConfig("extraction.test_hosts", [`${FIXTURE_HOST}:${port}`]);
  await setConfig("extraction.delay_ms", 0);
  await setConfig("extraction.max_concurrent_jobs", 20);
});

test.afterAll(async () => {
  for (const id of createdEmbeds) {
    await adminApi(`extraction/embeds/${id}/revoke`, { method: "POST" });
  }
  await setConfig("extraction.test_hosts", []);
  await setConfig("extraction.delay_ms", 500);
  await setConfig("extraction.max_concurrent_jobs", 2);
  await new Promise((resolve) => server?.close(resolve));
});

async function studioLogin(page: Page) {
  await page.goto(`${ADMIN}/login`);
  await page.getByLabel("Username").fill(process.env.NETFLY_ADMIN_USER ?? "admin");
  await page.getByLabel("Password").fill(process.env.NETFLY_ADMIN_PASSWORD ?? "netfly-dev-admin");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

async function audit(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`),
  ).toEqual([]);
}

async function openLink(page: Page, search: string) {
  await page.getByRole("searchbox", { name: "Search links" }).fill(search);
  const row = page.getByRole("row", { name: new RegExp(search.replace(/[.?]/g, "\\$&")) }).first();
  await expect(row).toBeVisible();
  await row.click();
  const panel = page.getByRole("dialog");
  await expect(panel).toBeVisible();
  return panel;
}

test("crawl a site, check links, approve an embed and revoke it", async ({ page }) => {
  test.setTimeout(180_000);
  await studioLogin(page);
  await page.goto(`${ADMIN}/extraction`);
  await expect(page.getByRole("heading", { name: "Video extraction" })).toBeVisible();

  // A missing scheme is offered, not silently changed.
  const address = page.getByLabel("Website address");
  await address.fill("example.com/videos");
  await address.blur();
  await expect(page.getByRole("button", { name: /^Use https:\/\// })).toBeVisible();
  await audit(page);

  await address.fill(`${origin}/`);
  await page.getByRole("button", { name: "Check links" }).click();
  await page.waitForURL(/\/extraction\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("status").filter({ hasText: "Finished:" })).toBeVisible({
    timeout: 60_000,
  });

  // Links appear with the right kinds.
  const grid = page.getByRole("grid");
  await expect(
    grid.getByRole("row", { name: `Video file: ${origin}/media/clip.mp4` }),
  ).toBeVisible();
  await expect(grid.getByRole("row", { name: `Page: ${origin}/locked` })).toBeVisible();
  await page.getByRole("radio", { name: "Videos" }).click();
  await expect(grid.getByRole("row", { name: `Stream: ${origin}/hls/master.m3u8` })).toBeVisible();
  await page.getByRole("radio", { name: "All" }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export CSV" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^netfly-links-.+\.csv$/);
  const csv = await (await download.createReadStream()).toArray();
  expect(Buffer.concat(csv).toString("utf8")).toContain(`${origin}/media/clip.mp4,video_file,`);
  await audit(page);

  // The MP4: plays in NETFLY, and the preview plays.
  let panel = await openLink(page, "clip.mp4");
  await expect(panel.getByText("Plays in NETFLY: Yes")).toBeVisible({ timeout: 30_000 });
  await expect(
    panel.getByText(/plays in NETFLY \(CORS allowed, range requests supported\)/),
  ).toBeVisible();
  const video = page
    .frameLocator('iframe[title^="Preview"]')
    .locator('[data-testid="extraction-preview-video"]');
  await expect(video).toBeAttached({ timeout: 20_000 });
  await expect
    .poll(
      () =>
        video.evaluate(async (el: HTMLVideoElement) => {
          el.muted = true;
          await el.play().catch(() => undefined);
          return el.currentTime;
        }),
      { timeout: 20_000 },
    )
    .toBeGreaterThan(0);
  await audit(page);
  await panel.getByRole("button", { name: "Close overview" }).click();

  // The X-Frame-Options page: No, with the reason.
  panel = await openLink(page, "/locked");
  await expect(
    panel.getByText("Blocked: the site forbids embedding (X-Frame-Options: SAMEORIGIN)."),
  ).toBeVisible({
    timeout: 30_000,
  });
  await expect(panel.getByRole("button", { name: "Confirm embedding" })).toBeDisabled();
  await panel.getByRole("button", { name: "Close overview" }).click();

  // Confirm embedding on the MP4: title and description are written, the rights box is required.
  panel = await openLink(page, "clip.mp4");
  await expect(panel.getByText("Plays in NETFLY: Yes")).toBeVisible({ timeout: 30_000 });
  await panel.getByRole("button", { name: "Confirm embedding" }).click();
  const dialog = page.getByRole("dialog", { name: "Confirm embedding" });
  const titleField = dialog.getByLabel(/^Title/);
  await expect(titleField).toHaveValue("Clip"); // prefilled from the check (here: the file name)
  await titleField.fill("Fixture test pattern");
  // Both are required: nothing is saved without a description and the rights box.
  await dialog.getByRole("button", { name: "Confirm embedding" }).click();
  await expect(dialog.getByText(/Write a description viewers will see/)).toBeVisible();
  await expect(dialog.getByText("Confirm the rights before saving.")).toBeVisible();
  await dialog.getByLabel("Description").fill("A three-second test pattern, free to embed.");
  await dialog
    .getByLabel(
      "I confirm NETFLY has the rights to show this video, or its owner permits embedding.",
    )
    .check();
  await dialog.getByRole("button", { name: "Confirm embedding" }).click();
  await expect(page.getByText("Saved for the client — not visible to viewers yet")).toBeVisible();
  await page.keyboard.press("Escape");

  // It appears under Approved embeds; revoke it.
  await page.goto(`${ADMIN}/extraction?tab=approved`);
  const item = page.getByRole("listitem").filter({ hasText: "Fixture test pattern" });
  await expect(item).toBeVisible();
  await expect(item.getByText("A three-second test pattern, free to embed.")).toBeVisible();
  const listed = await adminApi(
    "extraction/embeds?status=approved&search=Fixture%20test%20pattern",
  );
  for (const embed of ((await listed.json()) as { results: Array<{ id: number }> }).results) {
    createdEmbeds.push(embed.id);
  }
  await audit(page);
  await item.getByRole("button", { name: "Revoke" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Revoke" }).click();
  await expect(page.getByText("Embed revoked")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Fixture test pattern" })).toHaveCount(
    0,
  );
});

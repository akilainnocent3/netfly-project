import { deflateSync } from "node:zlib";
import type { Page } from "@playwright/test";
import { adminApi, adminToken, expect, signUp, test } from "./helpers";

// Changes a category's artwork and membership for everyone: runs in its own project, and puts
// everything back afterwards.
const ADMIN = process.env.NETFLY_ADMIN_URL ?? "http://localhost:3001";
test.describe.configure({ mode: "serial" });

type Genre = { id: number; slug: string; name: string; artwork: { id: string } | null };
type Tile = { slug: string; artwork: { key: string } | null; sample: { key: string } | null };

/** A solid-colour PNG (at least the 480×270 artwork minimum), built without an image library. */
function png(width: number, height: number, rgb: [number, number, number]): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array(width).fill(rgb).flat())]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(Array(height).fill(row)))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

async function uploadArtwork(rgb: [number, number, number]): Promise<string> {
  const form = new FormData();
  form.append("kind", "artwork");
  form.append("file", new Blob([new Uint8Array(png(960, 540, rgb))], { type: "image/png" }), "art.png");
  const res = await fetch(`${ADMIN}/api/v1/admin/images`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await adminToken()}` },
    body: form,
  });
  if (res.status === 409) return "";
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

async function tiles(page: Page): Promise<Tile[]> {
  return page.evaluate(async () => (await fetch("/api/v1/genres?translation=all")).json());
}

let genre: Genre | null = null;
let originalArtwork: string | null = null;
let addedTitle: number | null = null;

test.afterAll(async () => {
  if (!genre) return;
  await adminApi(`genres/${genre.id}`, {
    method: "PATCH",
    body: JSON.stringify({ artwork_id: originalArtwork }),
  });
  if (addedTitle) {
    await adminApi(`genres/${genre.id}/titles`, {
      method: "POST",
      body: JSON.stringify({ remove: [addedTitle] }),
    });
  }
});

test("uploaded category artwork shows on /categories, and a replacement shows at once", async ({
  page,
}) => {
  await signUp(page);
  const visible = await tiles(page);
  test.skip(!visible.length, "Needs a seeded catalog with categories.");
  const all = (await (await adminApi("genres")).json()) as Genre[];
  genre = all.find((g) => g.slug === visible[0]!.slug)!;
  originalArtwork = genre.artwork?.id ?? null;

  const first = await uploadArtwork([200, 30, 60]);
  test.skip(!first, "Image upload needs S3 configured (Settings → Storage & CDN).");
  await adminApi(`genres/${genre.id}`, {
    method: "PATCH",
    body: JSON.stringify({ artwork_id: first }),
  });
  // While it renders the tile still has an image (a title's backdrop), never a blank one.
  const rendering = (await tiles(page)).find((t) => t.slug === genre!.slug)!;
  expect(rendering.artwork ?? rendering.sample).not.toBeNull();

  await expect
    .poll(async () => (await tiles(page)).find((t) => t.slug === genre!.slug)?.artwork?.key ?? "")
    .toContain(first);
  await page.goto("/categories");
  const tile = page.getByRole("link", { name: new RegExp(genre.name) }).first();
  await expect(tile.locator("img")).toHaveAttribute("src", new RegExp(first));

  // Replace it: the next request (no TTL wait, same browser cache) has the new image.
  const second = await uploadArtwork([30, 90, 200]);
  await adminApi(`genres/${genre.id}`, {
    method: "PATCH",
    body: JSON.stringify({ artwork_id: second }),
  });
  await expect
    .poll(async () => (await tiles(page)).find((t) => t.slug === genre!.slug)?.artwork?.key ?? "", {
      timeout: 20_000,
    })
    .toContain(second);
  await page.reload();
  await expect(tile.locator("img")).toHaveAttribute("src", new RegExp(second));

  // …and it is the header of the category page.
  await tile.click();
  await page.waitForURL(`**/categories/${genre.slug}`);
  await expect(page.getByTestId("page-cover").locator("img")).toHaveAttribute(
    "src",
    new RegExp(second),
  );
});

async function studioLogin(page: Page) {
  await page.goto(`${ADMIN}/login`);
  await page.getByLabel("Username").fill(process.env.NETFLY_ADMIN_USER ?? "admin");
  await page.getByLabel("Password").fill(process.env.NETFLY_ADMIN_PASSWORD ?? "netfly-dev-admin");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

test("adding a movie to a category in Studio puts it on the viewer's category page", async ({
  page,
  browser,
}) => {
  const all = (await (await adminApi("genres")).json()) as Genre[];
  genre = genre ?? all.find((g) => g.slug === "comedy") ?? all[0] ?? null;
  test.skip(!genre, "Needs a seeded catalog with categories.");
  const target = genre!;
  const members = (await (await adminApi(`genres/${target.id}/titles`)).json()) as {
    results: Array<{ id: number }>;
  };
  const inGenre = new Set(members.results.map((t) => t.id));
  const picker = (await (await adminApi("title-picker?q=")).json()) as Array<{
    id: number;
    title: string;
    type: string;
    status: string;
  }>;
  const movie = picker.find((t) => t.type === "movie" && t.status === "published" && !inGenre.has(t.id));
  test.skip(!movie, "Every published movie is already in this category.");

  const studio = await browser.newPage();
  await studioLogin(studio);
  await studio.goto(`${ADMIN}/categories`);
  await studio.getByRole("button", { name: new RegExp(`^Titles in ${target.name}:`) }).click();
  const dialog = studio.getByRole("dialog", { name: `Titles in “${target.name}”` });
  await dialog.getByRole("button", { name: "Add titles" }).click();
  await dialog.getByLabel("Search titles to add").fill(movie!.title);
  await dialog.getByRole("checkbox", { name: new RegExp(movie!.title) }).click();
  await dialog.getByRole("button", { name: "Add 1 title" }).click();
  addedTitle = movie!.id;
  await expect(dialog.getByText(movie!.title, { exact: true })).toBeVisible();
  await studio.close();

  await signUp(page);
  await page.goto(`/categories/${target.slug}`);
  await expect(page.getByRole("heading", { level: 1, name: target.name })).toBeVisible();
  // Each mode lists what's translated / not; the movie appears in one of them.
  const inMode = async (mode: string) =>
    page.evaluate(
      async ([slug, m]) =>
        (await (await fetch(`/api/v1/genres/${slug}/titles?translation=${m}&sort=az`)).json())
          .rows[0].items.map((t: { id: number }) => t.id),
      [target.slug, mode],
    );
  const ids = [...(await inMode("translated")), ...(await inMode("not_translated"))];
  expect(ids).toContain(movie!.id);
});

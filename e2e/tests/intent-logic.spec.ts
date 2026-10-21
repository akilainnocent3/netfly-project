/** Unit tests (no browser): redirect safety and sign-in intents. */
import { expect, test } from "@playwright/test";
import {
  cleanIntent,
  decodeIntentParam,
  encodeIntentParam,
  intentNext,
  type Intent,
} from "../../apps/client/src/lib/intent";
import { safeNext } from "../../apps/client/src/lib/safe-next";

test("safeNext only allows same-site paths", () => {
  expect(safeNext("/watch/neon-tide?episode=3")).toBe("/watch/neon-tide?episode=3");
  expect(safeNext("/browse#row")).toBe("/browse#row");
  for (const evil of [
    "https://evil.example/",
    "//evil.example/x",
    "/\\evil.example",
    "\\\\evil.example",
    "javascript:alert(1)",
    "/x\n/y",
    "",
    null,
    "x".repeat(3000),
  ]) {
    expect(safeNext(evil)).toBe("/browse");
  }
  expect(safeNext("//evil", "/")).toBe("/");
});

const base: Intent = {
  action: "my_list",
  slug: "neon-tide",
  titleId: 12,
  path: "/browse?translation=translated",
  scroll: 640,
  at: Date.now(),
};

test("intents are validated: enum action, slug, ids, values, safe path, freshness", () => {
  expect(cleanIntent(base)).toMatchObject({ action: "my_list", slug: "neon-tide", titleId: 12, scroll: 640 });
  expect(cleanIntent({ ...base, action: "delete_account" })).toBeNull();
  expect(cleanIntent({ ...base, slug: "../../etc" })).toBeNull();
  expect(cleanIntent({ ...base, titleId: -1 })).toBeNull();
  expect(cleanIntent({ ...base, action: "rate", value: 7 })).toBeNull();
  expect(cleanIntent({ ...base, action: "rate", value: -1 })?.value).toBe(-1);
  expect(cleanIntent({ ...base, path: "//evil.example" })?.path).toBe("/browse");
  expect(cleanIntent({ ...base, at: Date.now() - 2 * 3600_000 })).toBeNull();
  expect(cleanIntent({ action: "play", slug: "neon-tide", path: "/", scroll: 0 })?.titleId).toBeUndefined();
  expect(cleanIntent("not an object")).toBeNull();
});

test("next URL: Play goes straight to the player; other actions come back with ?intent=", () => {
  expect(intentNext({ ...base, action: "play", episode: 7 })).toBe("/watch/neon-tide?episode=7");
  expect(intentNext({ ...base, action: "play", episode: null })).toBe("/watch/neon-tide");
  const next = intentNext(base);
  expect(next).toBe("/browse?translation=translated&intent=my_list.neon-tide.12");
  const rated = intentNext({ ...base, action: "rate", value: 2, path: "/title/neon-tide" });
  expect(rated).toBe("/title/neon-tide?intent=rate.neon-tide.12.2");
});

test("the ?intent= param round-trips and rejects junk", () => {
  const encoded = encodeIntentParam({ ...base, action: "rate", value: -1 });
  expect(decodeIntentParam(encoded, "/browse")).toMatchObject({ action: "rate", value: -1, titleId: 12 });
  expect(decodeIntentParam("rate.neon-tide.12.9", "/")).toBeNull();
  expect(decodeIntentParam("hack.neon-tide.12", "/")).toBeNull();
  expect(decodeIntentParam("my_list.Bad Slug.12", "/")).toBeNull();
  expect(decodeIntentParam("x".repeat(400), "/")).toBeNull();
});

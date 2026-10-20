import { chromium } from "@playwright/test";
const [,, url, out, w = "1440", h = "900", actions = ""] = process.argv;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(url, { waitUntil: "networkidle" });
if (actions) { for (const step of actions.split(";;")) { await eval(`(async()=>{${step}})()`); } }
await page.waitForTimeout(800);
await page.screenshot({ path: out });
console.log("URL", page.url()); console.log("ERRORS", JSON.stringify(errors));
await browser.close();

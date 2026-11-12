import { chromium } from "playwright";

const BASE = "https://tidepost.sankalpmukim.dev";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on("response", async (res) => {
  if (res.status() >= 400) {
    let body = "";
    try { body = (await res.text()).slice(0, 300); } catch {}
    console.log(`${res.status()} ${res.request().method()} ${res.url().replace(BASE, "")} -> ${body}`);
  }
});
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message.split("\n")[0]));

await page.goto(BASE);
await page.getByRole("link", { name: "Open Tidepost" }).click();
await page.getByRole("heading", { name: /Get through the inbox/ }).waitFor({ timeout: 15000 });
console.log("on sign-in page");
await page.getByRole("button", { name: /Try a demo mailbox/ }).click();
await page.waitForTimeout(6000);
console.log("url now:", page.url());
console.log("shell:", await page.locator(".shell").count(), "| rows:", await page.locator(".row").count());
await browser.close();

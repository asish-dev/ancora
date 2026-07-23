// Instrument canary: with NO correction (raw list, no library), streaming MUST
// produce runaway deviation. If this fails, the sampler is lying and every
// green gate is meaningless. (Spike measured 1427px over ~8s.)
import { expect, test } from "@playwright/test";
import { sampleDeviation, waitForApp } from "./helpers";

test("raw list with no correction shows runaway bottom deviation", async ({ page }) => {
  await page.goto("/?naive=1&count=300");
  await waitForApp(page);
  // pin once to the bottom, then let streaming run uncorrected
  await page.evaluate(() => {
    const el = document.querySelector(".raw-scroller") as HTMLElement;
    el.scrollTop = el.scrollHeight - el.clientHeight;
  });
  const s = await sampleDeviation(page, 400);
  expect(s.max).toBeGreaterThan(100);
  expect(s.jitter).toBeGreaterThan(10);
});

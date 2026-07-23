// P1 hard gate: 0 jitter frames while pinned under 30ms token streaming.
// Sampled by the independent in-page instrument, both rendering modes.
import { expect, test } from "@playwright/test";
import { sampleDeviation, waitForApp } from "./helpers";

test("windowed mode: pin holds pixel-stable under streaming (0 jitter frames)", async ({ page }) => {
  await page.goto("/?count=300");
  await waitForApp(page);
  const s = await sampleDeviation(page, 600); // ~10s @60fps
  expect(s.jitter).toBe(0);
  expect(s.max).toBeLessThanOrEqual(1.5);
});

test("flow mode: pin holds pixel-stable under streaming (0 jitter frames)", async ({ page }) => {
  await page.goto("/?count=30&threshold=100000"); // never virtualizes
  await waitForApp(page);
  await expect(page.locator("[data-ancora-mode]")).toHaveAttribute("data-ancora-mode", "flow");
  const s = await sampleDeviation(page, 600);
  expect(s.jitter).toBe(0);
  expect(s.max).toBeLessThanOrEqual(1.5);
});

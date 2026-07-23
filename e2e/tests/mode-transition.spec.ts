// P4 gates: mode transitions are invisible.
import { expect, test } from "@playwright/test";
import {
  expectPinState,
  readMetric,
  sampleDeviation,
  userScrollUp,
  waitForApp,
} from "./helpers";

test("P4a: flow→windowed while pinned+streaming crosses with 0 jitter", async ({ page }) => {
  await page.goto("/?count=95&threshold=100"); // streams past the threshold
  await waitForApp(page);
  await expect(page.locator("[data-ancora-mode]")).toHaveAttribute("data-ancora-mode", "flow");
  // sample straight through the crossing
  const s = await sampleDeviation(page, 900); // ~15s covers the crossing comfortably
  expect(s.jitter).toBe(0);
  await expect(page.locator("[data-ancora-mode]")).toHaveAttribute(
    "data-ancora-mode",
    "windowed",
  );
});

test("P4b: transition is DEFERRED while the user reads, applies on repin", async ({ page }) => {
  await page.goto("/?count=95&threshold=100&stream=0");
  await waitForApp(page);
  await userScrollUp(page, 3);
  await expectPinState(page, "unpinned");

  // capture a visible row position, then stream past the threshold
  const anchor = await page.evaluate(() => {
    const el = document.querySelector(".ancora-scroller") as HTMLElement;
    const vpTop = el.getBoundingClientRect().top;
    const row = [...el.querySelectorAll<HTMLElement>("[data-ancora-key]")]
      .map((n) => ({ key: n.dataset["ancoraKey"] as string, top: n.getBoundingClientRect().top }))
      .find((r) => r.top > vpTop + 100)!;
    return row;
  });
  await page.getByTestId("toggle-stream").click(); // resume
  await expect
    .poll(async () => Number(await readMetric(page, "messages")), { timeout: 20_000 })
    .toBeGreaterThan(105);

  // still flow (deferred), and the row the user is reading has not moved
  await expect(page.locator("[data-ancora-mode]")).toHaveAttribute("data-ancora-mode", "flow");
  const topNow = await page.evaluate((key) => {
    const node = document.querySelector<HTMLElement>(`[data-ancora-key="${CSS.escape(key)}"]`);
    return node ? Number(node.getBoundingClientRect().top.toFixed(2)) : null;
  }, anchor.key);
  expect(topNow).not.toBeNull();
  expect(Math.abs((topNow as number) - anchor.top)).toBeLessThan(1);

  // repin → the deferred transition applies
  await page.getByTestId("scroll-bottom").click();
  await expectPinState(page, "PINNED");
  await expect(page.locator("[data-ancora-mode]")).toHaveAttribute(
    "data-ancora-mode",
    "windowed",
  );
});

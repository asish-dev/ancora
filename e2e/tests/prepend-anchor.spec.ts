// P3 hard gate: prepending history while the user reads causes <1px anchor
// shift — immediately AND through the settle window — in both modes.
import { expect, test } from "@playwright/test";
import {
  expectPinState,
  measureAnchorAcross,
  userScrollUp,
  waitForApp,
} from "./helpers";

async function prependGate(page: import("@playwright/test").Page, url: string) {
  await page.goto(url);
  await waitForApp(page);
  await userScrollUp(page, 5);
  await expectPinState(page, "unpinned");
  for (let run = 0; run < 3; run++) {
    const shift = await measureAnchorAcross(page, async () => {
      await page.getByTestId("prepend").click();
    });
    expect(Math.abs(shift.immediateShift), `run ${run} immediate`).toBeLessThan(1);
    expect(Math.abs(shift.settleShift), `run ${run} settle`).toBeLessThan(1);
  }
}

test("windowed mode: 3 prepends, <1px anchor shift incl. settle", async ({ page }) => {
  await prependGate(page, "/?count=300&stream=0");
});

test("flow mode: 3 prepends, <1px anchor shift incl. settle", async ({ page }) => {
  await prependGate(page, "/?count=80&threshold=100000&stream=0");
});

test("windowed mode: prepend DURING streaming, <1px anchor shift", async ({ page }) => {
  await page.goto("/?count=300");
  await waitForApp(page);
  await userScrollUp(page, 5);
  await expectPinState(page, "unpinned");
  const shift = await measureAnchorAcross(page, async () => {
    await page.getByTestId("prepend").click();
  });
  expect(Math.abs(shift.immediateShift)).toBeLessThan(1);
  expect(Math.abs(shift.settleShift)).toBeLessThan(1);
});

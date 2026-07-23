// Scrollbar-drag torture (spike protocol step 5): yank into unmeasured
// territory repeatedly; rendered rows must tile the viewport — no gaps, no
// overlaps, no blank regions. Plus scrollTo convergence (spike criterion c).
import { expect, test } from "@playwright/test";
import { expectPinState, userScrollUp, waitForApp } from "./helpers";

test("random scroll teleports leave no gaps or overlaps in the viewport", async ({ page }) => {
  await page.goto("/?count=1000&stream=0");
  await waitForApp(page);
  // unpin like a user first — while pinned, teleports would (correctly) snap back
  await userScrollUp(page, 2);
  await expectPinState(page, "unpinned");
  const problems = await page.evaluate(async () => {
    const el = document.querySelector(".ancora-scroller") as HTMLElement;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const issues: string[] = [];
    let seed = 12345;
    const rng = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < 12; i++) {
      el.scrollTop = rng() * (el.scrollHeight - el.clientHeight);
      await sleep(180); // let the window render + measure
      const vp = el.getBoundingClientRect();
      const rows = [...el.querySelectorAll<HTMLElement>("[data-ancora-key]")]
        .map((n) => n.getBoundingClientRect())
        .filter((r) => r.bottom > vp.top && r.top < vp.bottom)
        .sort((a, b) => a.top - b.top);
      if (rows.length === 0) {
        issues.push(`teleport ${i}: blank viewport`);
        continue;
      }
      if ((rows[0] as DOMRect).top > vp.top + 1) issues.push(`teleport ${i}: gap at top`);
      if ((rows[rows.length - 1] as DOMRect).bottom < vp.bottom - 1)
        issues.push(`teleport ${i}: gap at bottom`);
      for (let j = 1; j < rows.length; j++) {
        const gap = (rows[j] as DOMRect).top - (rows[j - 1] as DOMRect).bottom;
        if (gap > 1) issues.push(`teleport ${i}: ${gap.toFixed(1)}px gap between rows`);
        if (gap < -1) issues.push(`teleport ${i}: ${(-gap).toFixed(1)}px overlap`);
      }
    }
    return issues;
  });
  expect(problems).toEqual([]);
});

test("scrollToMessage converges and enters reading mode", async ({ page }) => {
  await page.goto("/?count=300");
  await waitForApp(page);
  await page.getByTestId("scroll-random").click();
  await page.waitForTimeout(600);
  await expectPinState(page, "unpinned");
  // some row's top must sit at the viewport top (align: start, ±1.5px)
  const err = await page.evaluate(() => {
    const el = document.querySelector(".ancora-scroller") as HTMLElement;
    const vpTop = el.getBoundingClientRect().top;
    const tops = [...el.querySelectorAll<HTMLElement>("[data-ancora-key]")].map((n) =>
      Math.abs(n.getBoundingClientRect().top - vpTop),
    );
    return Math.min(...tops);
  });
  expect(err).toBeLessThanOrEqual(1.5);
});

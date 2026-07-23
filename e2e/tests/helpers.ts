import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

export const SCROLLER = ".ancora-scroller, .raw-scroller";

export async function waitForApp(page: Page): Promise<void> {
  await page.locator(SCROLLER).waitFor();
  await page.waitForTimeout(1500); // mount warmup (estimate→measured snap)
}

export async function readMetric(page: Page, label: string): Promise<string> {
  return page.evaluate((l) => {
    const row = [...document.querySelectorAll(".metric")].find(
      (m) => m.querySelector(".k")?.textContent === l,
    );
    return row?.querySelector(".v")?.textContent ?? "";
  }, label);
}

export async function expectPinState(page: Page, state: "PINNED" | "unpinned") {
  await expect
    .poll(() => readMetric(page, "pin state"), { timeout: 3000 })
    .toBe(state);
}

/**
 * The verdict instrument: an in-page rAF sampler reading the deviation between
 * list bottom and viewport bottom at frame start — independent of both the
 * library's bookkeeping and the playground's panel. Tasks (React commits) run
 * before a frame's rAF phase, so each sample sees the state that will paint.
 */
export async function sampleDeviation(
  page: Page,
  frames: number,
): Promise<{ frames: number; jitter: number; max: number }> {
  return page.evaluate(
    ({ frames, sel }) =>
      new Promise<{ frames: number; jitter: number; max: number }>((resolve) => {
        const el = document.querySelector(sel) as HTMLElement;
        let n = 0;
        let jitter = 0;
        let max = 0;
        const loop = () => {
          const dev = Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop);
          if (dev > max) max = dev;
          if (dev > 1.5) jitter++;
          if (++n < frames) requestAnimationFrame(loop);
          else resolve({ frames: n, jitter, max: Number(max.toFixed(1)) });
        };
        requestAnimationFrame(loop);
      }),
    { frames, sel: SCROLLER },
  );
}

/**
 * Scroll up like a user: dispatch a wheel event (input corroboration — real
 * user scrolls are always preceded by input; the library classifies
 * non-corroborated scrolls as browser-originated) then move scrollTop.
 */
export async function userScrollUp(page: Page, screens = 4): Promise<void> {
  await page.evaluate(
    async ({ screens, sel }) => {
      const el = document.querySelector(sel) as HTMLElement;
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      for (let i = 0; i < screens; i++) {
        el.dispatchEvent(new WheelEvent("wheel", { deltaY: -el.clientHeight, bubbles: true }));
        el.scrollTop = Math.max(0, el.scrollTop - el.clientHeight);
        await sleep(90);
      }
    },
    { screens, sel: SCROLLER },
  );
}

export interface AnchorShift {
  key: string;
  immediateShift: number;
  settleShift: number;
}

/** Measure a visible row's on-screen movement across a mutation (P3 gate). */
export async function measureAnchorAcross(
  page: Page,
  mutate: () => Promise<void>,
  settleMs = 1300,
): Promise<AnchorShift> {
  const anchor = await page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement;
    const vpTop = el.getBoundingClientRect().top;
    const rows = [...el.querySelectorAll<HTMLElement>("[data-ancora-key]")];
    const pick = rows
      .map((n) => ({ key: n.dataset["ancoraKey"] as string, top: n.getBoundingClientRect().top }))
      .find((r) => r.top > vpTop + 100);
    return pick ?? null;
  }, SCROLLER);
  if (!anchor) throw new Error("no anchor row visible");

  const topOf = () =>
    page.evaluate(
      ({ key, sel }) => {
        const el = document.querySelector(sel) as HTMLElement;
        const node = el.querySelector<HTMLElement>(`[data-ancora-key="${CSS.escape(key)}"]`);
        return node ? Number(node.getBoundingClientRect().top.toFixed(2)) : null;
      },
      { key: anchor.key, sel: SCROLLER },
    );

  await mutate();
  await page.waitForTimeout(60);
  const immediate = await topOf();
  await page.waitForTimeout(settleMs);
  const settled = await topOf();
  return {
    key: anchor.key,
    immediateShift: immediate === null ? NaN : Number((immediate - anchor.top).toFixed(2)),
    settleShift: settled === null ? NaN : Number((settled - anchor.top).toFixed(2)),
  };
}

// Pin-stability (criterion a) measurement via headless Chromium.
// Runs two 30s pinned-streaming windows: sync-pin ON vs OFF, and reports
// the jitter-frame ratio measured ONLY inside each window (delta of the
// harness's cumulative counters), so setup frames don't pollute the number.
const { chromium } = require(
  "/Users/asish/Downloads/pin-virt-spike/node_modules/playwright",
);

const URL = "http://localhost:5173";
const WINDOW_MS = 30_000;

async function readStats(page) {
  return page.evaluate(() => {
    const get = (label) =>
      [...document.querySelectorAll(".metric")]
        .find((m) => m.querySelector(".k")?.textContent === label)
        ?.querySelector(".v")?.textContent;
    return {
      fps: get("fps"),
      pin: get("pin state"),
      dev: get("deviation now"),
      maxDev: get("max deviation"),
      jitter: get("jitter frames (>1.5px)"),
      messages: get("messages"),
    };
  });
}

const parseJitter = (s) => {
  const m = (s || "").match(/(\d+)\s*\/\s*(\d+)/);
  return m ? { j: +m[1], f: +m[2] } : null;
};

async function runScenario(page, label, setup) {
  await page.goto(URL, { waitUntil: "networkidle" });
  if (setup) await setup(page);
  await page.waitForTimeout(4000); // mount warmup + toggle settle
  const s1 = await readStats(page);
  await page.waitForTimeout(WINDOW_MS);
  const s2 = await readStats(page);
  const t1 = parseJitter(s1.jitter);
  const t2 = parseJitter(s2.jitter);
  const dj = t2 && t1 ? t2.j - t1.j : NaN;
  const df = t2 && t1 ? t2.f - t1.f : NaN;
  console.log(`\n=== ${label} ===`);
  console.log("  start:", JSON.stringify(s1));
  console.log("  end:  ", JSON.stringify(s2));
  console.log(
    `  window: ${dj}/${df} jitter frames = ${
      df > 0 ? ((100 * dj) / df).toFixed(2) : "n/a"
    }%  (pass < 1%)`,
  );
  return { label, dj, df, pct: df > 0 ? (100 * dj) / df : NaN };
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1400, height: 900 },
  });

  const results = [];
  results.push(await runScenario(page, "sync pin ON (RO pre-paint)", null));
  results.push(
    await runScenario(page, "sync pin OFF (rAF-only baseline)", async (p) => {
      await p.locator('label:has-text("sync pin") input').uncheck();
    }),
  );

  console.log("\n=== SUMMARY ===");
  for (const r of results)
    console.log(
      `  ${r.label}: ${r.pct.toFixed(2)}% jitter over ${r.df} frames`,
    );
  await browser.close();
})();

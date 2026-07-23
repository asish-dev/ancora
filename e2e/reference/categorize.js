// Categorize the jitter: RO corrections (count+magnitude), and harness jitter
// frames split into token-growth vs message-boundary, with magnitude buckets.
const { chromium } = require(
  "/Users/asish/Downloads/pin-virt-spike/node_modules/playwright",
);

function bucket(mag) {
  const a = Math.abs(mag);
  return a < 5 ? "1.5-5" : a < 25 ? "5-25" : a < 100 ? "25-100" : ">100";
}

async function run(page, label, syncOn) {
  await page.goto("http://localhost:5173", { waitUntil: "networkidle" });
  if (!syncOn)
    await page.locator('label:has-text("sync pin") input').uncheck();
  await page.waitForTimeout(3000); // warmup

  const roCorr = [];
  const jitter = [];
  const handler = (msg) => {
    if (msg.type() !== "debug") return;
    const t = msg.text();
    if (t.startsWith("[syncpin]")) roCorr.push(parseFloat(t.split(" ")[1]));
    else if (t.startsWith("[jitter]")) {
      const [, dev, kind] = t.split(" ");
      jitter.push({ dev: parseFloat(dev), kind });
    }
  };
  page.on("console", handler);
  await page.waitForTimeout(30000);
  page.off("console", handler);

  const byKind = { token: 0, BOUNDARY: 0 };
  const byBucket = {};
  const tokenBuckets = {};
  for (const j of jitter) {
    byKind[j.kind] = (byKind[j.kind] || 0) + 1;
    byBucket[bucket(j.dev)] = (byBucket[bucket(j.dev)] || 0) + 1;
    if (j.kind === "token")
      tokenBuckets[bucket(j.dev)] = (tokenBuckets[bucket(j.dev)] || 0) + 1;
  }
  console.log(`\n=== ${label} ===`);
  console.log("  RO corrections:", roCorr.length,
    roCorr.length ? `(worst ${Math.max(...roCorr.map(Math.abs)).toFixed(0)}px)` : "");
  console.log("  total jitter frames:", jitter.length);
  console.log("  by kind:", JSON.stringify(byKind));
  console.log("  by magnitude:", JSON.stringify(byBucket));
  console.log("  token-only jitter by magnitude:", JSON.stringify(tokenBuckets));
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await run(page, "RO-only (syncPin ON)", true);
  await run(page, "rAF-only (syncPin OFF)", false);
  await browser.close();
})();

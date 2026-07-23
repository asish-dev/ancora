// Mechanism test, independent of component wiring: attach our own RO to the
// size container + all rendered rows, record deviation AT RO TIME (post-layout,
// pre-paint, before the harness's next-frame rAF correction).
const { chromium } = require(
  "/Users/asish/Downloads/pin-virt-spike/node_modules/playwright",
);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1400, height: 900 },
  });
  await page.goto("http://localhost:5173", { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);

  const result = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const el = document.querySelector(".scroller");
        const container = el.firstElementChild;
        const events = [];
        const ro = new ResizeObserver((entries) => {
          const dev = el.scrollHeight - el.clientHeight - el.scrollTop;
          events.push({
            t: +performance.now().toFixed(0),
            dev: +dev.toFixed(1),
            targets: entries.length,
            containerHit: entries.some((e) => e.target === container),
          });
        });
        ro.observe(container);
        for (const r of el.querySelectorAll("[data-key]")) ro.observe(r);
        // keep observing new rows as they mount
        const mo = new MutationObserver((muts) => {
          for (const m of muts)
            for (const n of m.addedNodes)
              if (n.nodeType === 1 && n.hasAttribute?.("data-key"))
                ro.observe(n);
        });
        mo.observe(container, { childList: true });
        setTimeout(() => {
          ro.disconnect();
          mo.disconnect();
          const nonzero = events.filter((e) => Math.abs(e.dev) > 1.5);
          resolve({
            totalROfires: events.length,
            nonzeroDevAtROtime: nonzero.length,
            worst: Math.max(0, ...events.map((e) => Math.abs(e.dev))),
            first20: events.slice(0, 20),
          });
        }, 8000);
      }),
  );
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})();

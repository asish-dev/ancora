// Underlying physics: with ALL correction disabled, does the bottom deviation
// run away (growth genuinely pushes content down => correction needed) or stay
// near zero (browser auto-anchors the bottom)? Sampled via in-page rAF so we
// read the layout that will paint this frame.
const { chromium } = require(
  "/Users/asish/Downloads/pin-virt-spike/node_modules/playwright",
);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto("http://localhost:5173", { waitUntil: "networkidle" });
  // syncPin ON so rAF corrector is disabled; __noCorrect disables the RO too.
  await page.evaluate(() => { window.__noCorrect = true; });
  await page.waitForTimeout(3500);
  // re-pin to bottom then sample deviation for ~8s with zero correction
  const res = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const el = document.querySelector(".scroller");
        el.scrollTop = el.scrollHeight - el.clientHeight; // pin once
        const devs = [];
        let n = 0;
        const loop = () => {
          devs.push(+(el.scrollHeight - el.clientHeight - el.scrollTop).toFixed(1));
          if (++n < 500) requestAnimationFrame(loop);
          else
            resolve({
              frames: devs.length,
              first: devs.slice(0, 8),
              last: devs.slice(-8),
              min: Math.min(...devs),
              max: Math.max(...devs),
              final: devs[devs.length - 1],
              nonzeroFrames: devs.filter((d) => Math.abs(d) > 1.5).length,
            });
        };
        requestAnimationFrame(loop);
      }),
  );
  console.log("NO-CORRECTION physics:", JSON.stringify(res, null, 2));
  await browser.close();
})();

// Full verdict battery across Chromium + WebKit.
//  (a) pin stability: for each corrector config, measure jitter over 20s AND
//      cross-check with an independent in-page rAF sampler (500 frames).
//  (b) prepend anchor: pause stream, unpin, prepend, measure anchor on-screen
//      shift immediately + after settle, by direct DOM measurement.
const pw = require("/Users/asish/Downloads/pin-virt-spike/node_modules/playwright");
const URL = "http://localhost:5173";
const parse = (s) => { const m=(s||"").match(/(\d+)\s*\/\s*(\d+)/); return m?{j:+m[1],f:+m[2]}:null; };

const readJitter = (page) => page.evaluate(() => {
  const g=(l)=>[...document.querySelectorAll(".metric")].find(m=>m.querySelector(".k")?.textContent===l)?.querySelector(".v")?.textContent;
  return { jitter:g("jitter frames (>1.5px)"), maxDev:g("max deviation"), pin:g("pin state"), fps:g("fps") };
});
const indepSampler = (page) => page.evaluate(() => new Promise((resolve)=>{
  const el=document.querySelector(".scroller"); const d=[]; let n=0;
  const loop=()=>{ d.push(Math.abs(el.scrollHeight-el.clientHeight-el.scrollTop)); if(++n<500) requestAnimationFrame(loop); else resolve({nonzero:d.filter(x=>x>1.5).length,max:+Math.max(...d).toFixed(1)}); };
  requestAnimationFrame(loop);
}));

async function setConfig(page, cfg) {
  const set = async (text, want) => {
    const cb = page.locator(`label:has-text("${text}") input`);
    if ((await cb.isChecked()) !== want) await cb.click();
  };
  await set("native scroll adjust", cfg.nativeAdjust);
  await set("frame-level anchor", cfg.frameCorrection);
  await set("sync pin", cfg.syncPin);
  await set("layout pin", cfg.layoutPin);
}

async function pinTest(page, label, cfg) {
  await page.goto(URL, { waitUntil: "networkidle" });
  await setConfig(page, cfg);
  await page.waitForTimeout(4000);
  const a = await readJitter(page);
  await page.waitForTimeout(20000);
  const b = await readJitter(page);
  const t1=parse(a.jitter), t2=parse(b.jitter);
  const pct = t2&&t1&&(t2.f-t1.f)>0 ? (100*(t2.j-t1.j)/(t2.f-t1.f)) : NaN;
  const indep = await indepSampler(page);
  console.log(`  [a] ${label}: harness ${pct.toFixed(2)}% | independent ${indep.nonzero}/500 frames >1.5px (max ${indep.max}px) | pin=${b.pin}`);
  return pct;
}

async function prependTest(page, label, cfg) {
  await page.goto(URL, { waitUntil: "networkidle" });
  await setConfig(page, cfg);
  await page.waitForTimeout(3000);
  const res = await page.evaluate(async () => {
    const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
    const el=document.querySelector(".scroller");
    // pause stream
    const pause=[...document.querySelectorAll(".panel button")].find(b=>/pause stream/i.test(b.textContent));
    if(pause) pause.click();
    await sleep(300);
    // scroll up in hops so onScroll lands outside the 50ms programmatic window
    el.scrollTop=Math.max(0,el.scrollTop-el.clientHeight*3); await sleep(120);
    el.scrollTop=Math.max(0,el.scrollTop-el.clientHeight*3); await sleep(350);
    const pin=[...document.querySelectorAll(".metric")].find(m=>m.querySelector(".k")?.textContent==="pin state")?.querySelector(".v")?.textContent;
    if(pin!=="unpinned") return {error:"could not unpin: "+pin};
    const vpTop=el.getBoundingClientRect().top;
    const anchor=[...el.querySelectorAll("[data-key]")].map(n=>({k:n.getAttribute("data-key"),top:n.getBoundingClientRect().top})).find(r=>r.top>vpTop+100);
    const topOf=()=>{const n=el.querySelector(`[data-key="${anchor.k}"]`); return n?+n.getBoundingClientRect().top.toFixed(2):null;};
    const before=topOf();
    [...document.querySelectorAll(".panel button")].find(b=>/prepend/i.test(b.textContent)).click();
    await sleep(60); const immediate=topOf();
    await sleep(1300); const settled=topOf();
    return { before, immediate, settled,
      immediateShift: immediate!=null?+(immediate-before).toFixed(2):null,
      settleShift: settled!=null?+(settled-before).toFixed(2):null };
  });
  console.log(`  [b] ${label}:`, JSON.stringify(res));
  return res;
}

(async () => {
  const engines = [["Chromium", pw.chromium], ["WebKit", pw.webkit]];
  // shipping candidate: layoutPin for pin, frameCorrection for prepend, no private internals
  const SHIP = { nativeAdjust:false, frameCorrection:true, syncPin:false, layoutPin:true };
  for (const [name, type] of engines) {
    const browser = await type.launch();
    const page = await browser.newPage({ viewport:{width:1400,height:900} });
    console.log(`\n########## ${name} ##########`);
    await pinTest(page, "layoutPin only", { nativeAdjust:false, frameCorrection:false, syncPin:false, layoutPin:true });
    await pinTest(page, "rAF only (baseline)", { nativeAdjust:false, frameCorrection:false, syncPin:false, layoutPin:false });
    await prependTest(page, "ship cfg (layoutPin+frameCorrection)", SHIP);
    await browser.close();
  }
})();

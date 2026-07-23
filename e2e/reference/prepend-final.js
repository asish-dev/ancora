// (b) prepend anchor across Chromium + WebKit. Uses __noCorrect to freeze pin
// correctors so we can cleanly unpin (isolates prepend behavior). Prepend anchor
// compensation (useLayoutEffect) + settle monitor are NOT gated by __noCorrect,
// so they still run — exactly the code path the shipping lib would use.
const pw = require("/Users/asish/Downloads/pin-virt-spike/node_modules/playwright");
const URL="http://localhost:5173";
async function setCfg(page,c){const s=async(t,w)=>{const cb=page.locator(`label:has-text("${t}") input`);if((await cb.isChecked())!==w)await cb.click();};
  await s("native scroll adjust",c.na);await s("frame-level anchor",c.fc);await s("sync pin",c.sp);await s("layout pin",c.lp);}
async function prepend(page){return page.evaluate(async()=>{
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const el=document.querySelector(".scroller");
  window.__noCorrect=true;                    // freeze pin correctors
  [...document.querySelectorAll(".panel button")].find(b=>/pause/i.test(b.textContent))?.click();
  await sleep(300);
  let unpinned=false;
  for(let i=0;i<6&&!unpinned;i++){el.scrollTop=Math.max(0,el.scrollTop-el.clientHeight*2);await sleep(120);unpinned=!!document.querySelector(".repin");}
  if(!unpinned)return{error:"could not unpin"};
  const vpTop=el.getBoundingClientRect().top;
  const anchor=[...el.querySelectorAll("[data-key]")].map(n=>({k:n.getAttribute("data-key"),top:n.getBoundingClientRect().top})).find(r=>r.top>vpTop+100);
  const topOf=()=>{const n=el.querySelector(`[data-key="${anchor.k}"]`);return n?+n.getBoundingClientRect().top.toFixed(2):null;};
  const before=topOf();
  [...document.querySelectorAll(".panel button")].find(b=>/prepend/i.test(b.textContent)).click();
  await sleep(60);const immediate=topOf();
  await sleep(1400);const settled=topOf();
  return{anchor:anchor.k,before,immediate,settled,
    immediateShift:immediate!=null?+(immediate-before).toFixed(2):"left-DOM-then-returned",
    settleShift:settled!=null?+(settled-before).toFixed(2):null};
});}
(async()=>{
  const SHIP={na:false,fc:true,sp:false,lp:true};
  for(const[name,type]of[["Chromium",pw.chromium],["WebKit",pw.webkit]]){
    const b=await type.launch();const page=await b.newPage({viewport:{width:1400,height:900}});
    await page.goto(URL,{waitUntil:"networkidle"});await setCfg(page,SHIP);await page.waitForTimeout(3000);
    console.log(`\n### ${name} (b) prepend anchor, ship cfg (layoutPin + frameCorrection) ###`);
    for(let r=1;r<=3;r++)console.log(`  run ${r}:`,JSON.stringify(await prepend(page)));
    await b.close();
  }
})();

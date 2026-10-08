import { CachedHistoricalDays } from "../research/historical-cache.js";
import { assessForwardRolloverAdjustment } from "../research/rollover-adjustment-study.js";
import { newYorkClock } from "../market/time.js";
import type { FuturesContract, MinuteBar } from "../market/types.js";

const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("CACHE_ONLY: external API forbidden");}});
const cycles=[
 {cycle:"2025-12",old:"NQZ5",next:"NQH6",prior:"2025-12-12",roll:"2025-12-15"},
 {cycle:"2026-03",old:"NQH6",next:"NQM6",prior:"2026-03-13",roll:"2026-03-16"},
 {cycle:"2026-06",old:"NQM6",next:"NQU6",prior:"2026-06-12",roll:"2026-06-15"},
 {cycle:"2026-09",old:"NQU6",next:"NQZ6",prior:"2026-09-11",roll:"2026-09-14"}
] as const;
const contract=(ticker:string):FuturesContract=>({ticker,productCode:"NQ"});
function rth(bars:readonly MinuteBar[],date:string){
 return bars.filter(b=>{const c=newYorkClock(b.timestampMs),m=c.hour*60+c.minute;
  return c.date===date&&m>=570&&m<960;});
}
console.log("=== TM001 CAUSAL FORWARD ROLLOVER ADJUSTMENT STUDY ===");
console.log("CACHE ONLY | ZERO APIs | ZERO MUTATIONS | RAW EXECUTION PRICES UNCHANGED | POLICY NOT APPROVED");
for(const c of cycles){
 const [po,pn,ro,rn]=await Promise.all([
  cache.getDay(contract(c.old),c.prior),cache.getDay(contract(c.next),c.prior),
  cache.getDay(contract(c.old),c.roll),cache.getDay(contract(c.next),c.roll)
 ]);
 const result=assessForwardRolloverAdjustment(
  rth(po,c.prior),rth(pn,c.prior),rth(ro,c.roll),rth(rn,c.roll));
 console.log("ADJUSTMENT_STUDY "+JSON.stringify({...c,...result}));
 if(c.cycle==="2026-09"&&result.status!=="REVIEW_REQUIRED")
  throw Error("September incomplete prior session must fail closed");
}
console.log("TM001 FORWARD ADJUSTMENT STUDY: GREEN (DESCRIPTIVE; NO POLICY APPROVAL)");

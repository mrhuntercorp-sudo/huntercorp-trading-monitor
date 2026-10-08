import { CachedHistoricalDays } from "../research/historical-cache.js";
import { assessForwardRolloverAdjustment } from "../research/rollover-adjustment-study.js";
import { shiftResearchBars,rangeIntegrity,compareCrossBoundary } from "../research/rollover-signal-integrity.js";
import { newYorkClock } from "../market/time.js";
import type { FuturesContract,MinuteBar } from "../market/types.js";
const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("CACHE ONLY: API forbidden");}});
const cycles=[
 {cycle:"2025-12",old:"NQZ5",next:"NQH6",prior:"2025-12-12",roll:"2025-12-15"},
 {cycle:"2026-03",old:"NQH6",next:"NQM6",prior:"2026-03-13",roll:"2026-03-16"},
 {cycle:"2026-06",old:"NQM6",next:"NQU6",prior:"2026-06-12",roll:"2026-06-15"},
 {cycle:"2026-09",old:"NQU6",next:"NQZ6",prior:"2026-09-11",roll:"2026-09-14"}
] as const;
const contract=(ticker:string):FuturesContract=>({ticker,productCode:"NQ"});
const rth=(bars:readonly MinuteBar[],date:string)=>bars.filter(b=>{
 const c=newYorkClock(b.timestampMs),m=c.hour*60+c.minute;
 return c.date===date&&m>=570&&m<960;
});
console.log("=== TM001 ROLLOVER SIGNAL INTEGRITY STUDY ===");
console.log("CACHE ONLY | ZERO APIs | ZERO PRICE MUTATIONS | NO STRATEGY OR ROLLOVER APPROVAL");
for(const c of cycles){
 const [po,pn,ro,rn]=await Promise.all([
  cache.getDay(contract(c.old),c.prior),cache.getDay(contract(c.next),c.prior),
  cache.getDay(contract(c.old),c.roll),cache.getDay(contract(c.next),c.roll)
 ]);
 const [a,b,d,e]=[rth(po,c.prior),rth(pn,c.prior),rth(ro,c.roll),rth(rn,c.roll)];
 const decision=assessForwardRolloverAdjustment(a,b,d,e);
 if(decision.status!=="EVALUATED"){
  console.log("SIGNAL_INTEGRITY "+JSON.stringify({cycle:c.cycle,status:"REVIEW_REQUIRED",reason:decision.reason}));
  if(c.cycle!=="2026-09")throw Error("Unexpected rejection "+c.cycle);
  continue;
 }
 const offset=decision.priorSpreadPoints!;
 const adjusted=shiftResearchBars(e,offset);
 const geometry=rangeIntegrity(e.slice(0,15),adjusted.slice(0,15),offset);
 const boundary=compareCrossBoundary(a.at(-1)!.close,b.at(-1)!.close,d[0]!.open,e[0]!.open);
 if(!geometry.invariant)throw Error("Geometry invariant failed "+c.cycle);
 console.log("SIGNAL_INTEGRITY "+JSON.stringify({cycle:c.cycle,status:"EVALUATED",
  offsetPoints:offset,opening15:geometry,boundary,
  caveat:"RTH opening geometry and prior-RTH-close boundary only; overnight highs/lows and multi-roll chaining not evaluated"}));
}
console.log("TM001 ROLLOVER SIGNAL INTEGRITY: GREEN (DESCRIPTIVE; POLICY NOT APPROVED)");

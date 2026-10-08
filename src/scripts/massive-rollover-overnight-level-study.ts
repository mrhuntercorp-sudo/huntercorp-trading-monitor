import { CachedHistoricalDays } from "../research/historical-cache.js";
import { assessForwardRolloverAdjustment } from "../research/rollover-adjustment-study.js";
import { assessAdjustedOvernight } from "../research/rollover-overnight-level-study.js";
import { newYorkClock } from "../market/time.js";
import type { FuturesContract,MinuteBar } from "../market/types.js";
const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("CACHE ONLY: API forbidden");}});
const cycles=[
 {cycle:"2025-12",old:"NQZ5",next:"NQH6",prior:"2025-12-12",sunday:"2025-12-14",roll:"2025-12-15"},
 {cycle:"2026-03",old:"NQH6",next:"NQM6",prior:"2026-03-13",sunday:"2026-03-15",roll:"2026-03-16"},
 {cycle:"2026-06",old:"NQM6",next:"NQU6",prior:"2026-06-12",sunday:"2026-06-14",roll:"2026-06-15"},
 {cycle:"2026-09",old:"NQU6",next:"NQZ6",prior:"2026-09-11",sunday:"2026-09-13",roll:"2026-09-14"}
] as const;
const contract=(ticker:string):FuturesContract=>({ticker,productCode:"NQ"});
const rth=(bars:readonly MinuteBar[],date:string)=>bars.filter(b=>{
 const c=newYorkClock(b.timestampMs),m=c.hour*60+c.minute;
 return c.date===date&&m>=570&&m<960;
});
console.log("=== TM001 ADJUSTED OVERNIGHT LEVEL STUDY ===");
console.log("CACHE ONLY | ZERO APIs | NO TRADING OR ROLLOVER APPROVAL");
for(const c of cycles){
 const [po,pn,ro,rn,sunday]=await Promise.all([
  cache.getDay(contract(c.old),c.prior),cache.getDay(contract(c.next),c.prior),
  cache.getDay(contract(c.old),c.roll),cache.getDay(contract(c.next),c.roll),
  cache.getDay(contract(c.next),c.sunday)]);
 const oldPrior=rth(po,c.prior),newPrior=rth(pn,c.prior);
 const decision=assessForwardRolloverAdjustment(oldPrior,newPrior,rth(ro,c.roll),rth(rn,c.roll));
 if(decision.status!=="EVALUATED"){
  console.log("OVERNIGHT_LEVEL "+JSON.stringify({cycle:c.cycle,status:"REVIEW_REQUIRED",reason:decision.reason,
   note:"No offset or adjusted overnight level emitted"}));
  if(c.cycle!=="2026-09")throw Error("Unexpected rollover rejection "+c.cycle);
  continue;
 }
 const result=assessAdjustedOvernight([...sunday,...rn],c.roll,decision.priorSpreadPoints!,
  Math.max(...oldPrior.map(b=>b.high)),Math.min(...oldPrior.map(b=>b.low)));
 if(result.status!=="EVALUATED")throw Error("Incomplete overnight after recovery: "+c.cycle);
 console.log("OVERNIGHT_LEVEL "+JSON.stringify({cycle:c.cycle,...result}));
}
console.log("TM001 ADJUSTED OVERNIGHT LEVEL STUDY: GREEN (DESCRIPTIVE; POLICY NOT APPROVED)");

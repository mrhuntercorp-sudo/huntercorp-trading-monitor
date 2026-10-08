import { readdir } from "node:fs/promises";
import { CachedHistoricalDays } from "../research/historical-cache.js";
import { compareDualContractOvernight } from "../research/dual-contract-overnight.js";
import { assessForwardRolloverAdjustment } from "../research/rollover-adjustment-study.js";
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
console.log("=== TM001 DUAL-CONTRACT OVERNIGHT COMPARISON ===");
console.log("READ ONLY | ZERO APIs | NO IMPUTATION | NO POLICY APPROVAL");
for(const c of cycles){
 const [po,pn,ro,rn,ns]=await Promise.all([
  cache.getDay(contract(c.old),c.prior),cache.getDay(contract(c.next),c.prior),
  cache.getDay(contract(c.old),c.roll),cache.getDay(contract(c.next),c.roll),
  cache.getDay(contract(c.next),c.sunday)]);
 const decision=assessForwardRolloverAdjustment(rth(po,c.prior),rth(pn,c.prior),rth(ro,c.roll),rth(rn,c.roll));
 if(decision.status!=="EVALUATED"){
  console.log("DUAL_OVERNIGHT "+JSON.stringify({cycle:c.cycle,status:"REVIEW_REQUIRED",reason:decision.reason,
   note:"Prior RTH not valid; no dual-contract adjustment comparison"}));
  continue;
 }
 const names=new Set(await readdir("data/cache/massive/NQ/"+c.old));
 if(!names.has(c.sunday+".json")){
  console.log("DUAL_OVERNIGHT "+JSON.stringify({cycle:c.cycle,status:"REVIEW_REQUIRED",
   reason:"OLD_CONTRACT_SUNDAY_CACHE_ABSENT",missingTicker:c.old,missingUtcDate:c.sunday,
   note:"No provider calls; do not infer missing minutes"}));
  continue;
 }
 const os=await cache.getDay(contract(c.old),c.sunday);
 const result=compareDualContractOvernight([...os,...ro],[...ns,...rn],c.roll,decision.priorSpreadPoints!);
 console.log("DUAL_OVERNIGHT "+JSON.stringify({cycle:c.cycle,...result}));
}
console.log("TM001 DUAL-CONTRACT OVERNIGHT AUDIT: GREEN (DESCRIPTIVE; NO POLICY APPROVAL)");

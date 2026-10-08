import { CachedHistoricalDays } from "../research/historical-cache.js";
import { assessForwardRolloverAdjustment } from "../research/rollover-adjustment-study.js";
import { newYorkClock } from "../market/time.js";
import type { FuturesContract, MinuteBar } from "../market/types.js";

const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("CACHE ONLY: network forbidden");}});
const contract=(ticker:string):FuturesContract=>({ticker,productCode:"NQ"});
const cycles=[
 {name:"2025-12",old:"NQZ5",next:"NQH6",prior:"2025-12-12",roll:"2025-12-15"},
 {name:"2026-03",old:"NQH6",next:"NQM6",prior:"2026-03-13",roll:"2026-03-16"},
 {name:"2026-06",old:"NQM6",next:"NQU6",prior:"2026-06-12",roll:"2026-06-15"},
 {name:"2026-09",old:"NQU6",next:"NQZ6",prior:"2026-09-11",roll:"2026-09-14"}
] as const;
function rth(bars:readonly MinuteBar[],date:string){
 return bars.filter(b=>{const c=newYorkClock(b.timestampMs),m=c.hour*60+c.minute;return c.date===date&&m>=570&&m<960;});
}
type Event={effectiveMs:number;points:number;cycle:string};
function asOfOffset(events:readonly Event[],timestampMs:number){
 return events.reduce((total,e)=>total+(timestampMs>=e.effectiveMs?e.points:0),0);
}
function adjusted(raw:number,events:readonly Event[],at:number){return raw-asOfOffset(events,at);}
function assert(condition:boolean,message:string){if(!condition)throw Error(message);}
const events:Event[]=[];
console.log("=== TM001 MULTI-ROLLOVER CONTINUITY VALIDATION ===");
console.log("CACHE ONLY | CAUSAL AS-OF | RAW PRICES UNCHANGED | NO POLICY APPROVAL");
for(const c of cycles){
 const [po,pn,ro,rn]=await Promise.all([
  cache.getDay(contract(c.old),c.prior),cache.getDay(contract(c.next),c.prior),
  cache.getDay(contract(c.old),c.roll),cache.getDay(contract(c.next),c.roll)
 ]);
 const oldPrior=rth(po,c.prior),newPrior=rth(pn,c.prior),oldRoll=rth(ro,c.roll),newRoll=rth(rn,c.roll);
 const assessment=assessForwardRolloverAdjustment(oldPrior,newPrior,oldRoll,newRoll);
 if(c.name==="2026-09"){
  assert(assessment.status==="REVIEW_REQUIRED","September must remain quarantined");
  console.log("ROLLOVER "+JSON.stringify({cycle:c.name,status:"QUARANTINED",reason:assessment.reason,priorOldMinutes:oldPrior.length,priorNewMinutes:newPrior.length,eventAdded:false}));
  continue;
 }
 assert(assessment.status==="EVALUATED"&&assessment.priorSpreadPoints!==undefined,c.name+": incomplete or invalid rollover");
 const effectiveMs=newRoll[0]!.timestampMs;
 assert(Number.isFinite(effectiveMs),c.name+": invalid effective time");
 assert(events.every(e=>e.effectiveMs<effectiveMs),c.name+": non-monotonic event dates");
 const priorTimestamp=oldPrior.at(-1)!.timestampMs;
 const priorRaw=oldPrior.at(-1)!.close;
 const oldOffset=asOfOffset(events,priorTimestamp);
 const priorAdjusted=adjusted(priorRaw,events,priorTimestamp);
 const snapshot=events.map(e=>({cycle:e.cycle,at:e.effectiveMs,offset:asOfOffset(events,e.effectiveMs),raw:priorRaw,adjusted:adjusted(priorRaw,events,e.effectiveMs)}));
 const spread=assessment.priorSpreadPoints;
 if(spread===undefined)throw Error(c.name+": missing prior spread");
 const added:Event={cycle:c.name,effectiveMs,points:spread};
 events.push(added);
 assert(asOfOffset(events,priorTimestamp)===oldOffset,c.name+": future roll leaked into prior timestamp");
 assert(adjusted(priorRaw,events,priorTimestamp)===priorAdjusted,c.name+": earlier adjusted price changed");
 for(const item of snapshot){
  assert(asOfOffset(events,item.at)===item.offset,c.name+": future roll changed earlier offset");
  assert(adjusted(item.raw,events,item.at)===item.adjusted,c.name+": future roll changed earlier adjusted price");
 }
 assert(asOfOffset(events,effectiveMs)===oldOffset+added.points,c.name+": cumulative offset mismatch");
 const rawNewOpen=newRoll[0]!.open;
 const adjustedNewOpen=adjusted(rawNewOpen,events,effectiveMs);
 assert(Number.isFinite(adjustedNewOpen),c.name+": nonfinite adjusted price");
 console.log("ROLLOVER "+JSON.stringify({cycle:c.name,status:"EVALUATED_DESCRIPTIVE",priorSpreadPoints:added.points,effectiveUtc:new Date(effectiveMs).toISOString(),offsetBeforePoints:oldOffset,offsetAfterPoints:asOfOffset(events,effectiveMs),rawNewOpen,adjustedNewOpen,earlierPriceInvariant:true,priorRthBothComplete:true,rollRthBothComplete:true}));
}
assert(events.length===3,"Expected exactly three evaluated events");
const last=events.at(-1)!;
const cumulative=events.reduce((sum,e)=>sum+e.points,0);
assert(asOfOffset(events,last.effectiveMs)===cumulative,"Final cumulative offset mismatch");
console.log("CHAIN_SUMMARY "+JSON.stringify({evaluatedEvents:events.length,quarantinedCycle:"2026-09",cumulativeOffsetPoints:cumulative,earlierHistoryInvariant:true,methodologyApproval:false}));
console.log("TM001 MULTI-ROLLOVER CONTINUITY: GREEN (DESCRIPTIVE ONLY)");

/** Oct 15 opening-window research using cached data only. No API, no orders.
 * Evaluates frozen ORB5 entries as soon as 09:30-10:59 ET is complete.
 * Outcomes remain unresolved until all required exit bars are available.
 */
import {CachedHistoricalDays} from "../research/historical-cache.js";
import {newYorkClock} from "../market/time.js";
import {rthBars} from "../research/level-reclaim.js";
import {backtestConservativeOrb} from "../research/conservative-orb.js";
import type {MinuteBar} from "../market/types.js";
const date="2026-10-15",ticker="NQZ6";
const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("NETWORK_DISABLED");}});
const bars=await cache.getDay({ticker,productCode:"NQ"},date);
const clock=(b:MinuteBar)=>{const c=newYorkClock(b.timestampMs);return c.hour*60+c.minute;};
const rth=rthBars(bars,date);
const opening=rth.filter(b=>clock(b)>=570&&clock(b)<660);
const present=new Set(opening.map(b=>clock(b)));
const missing=Array.from({length:90},(_,i)=>570+i).filter(m=>!present.has(m));
console.log("=== TM001 OCT 15 OPENING WINDOW CHECK ===");
console.log("OCT15_OPENING_COVERAGE",JSON.stringify({date,ticker,observed:present.size,required:90,
 missing:missing.length,complete:missing.length===0,
 latestEt:rth.length?newYorkClock(rth.at(-1)!.timestampMs):null,
 requests:0,orders:0}));
if(missing.length){
 console.log("OCT15_OPENING_RESULT",JSON.stringify({status:"INCOMPLETE_OPENING_WINDOW",
  missingFromEt:`${String(Math.floor(missing[0]!/60)).padStart(2,"0")}:${String(missing[0]!%60).padStart(2,"0")}`,
  noTradeScoring:true}));process.exit(0);
}
// Reuse frozen ORB5 implementation, but prevent its full-RTH requirement from
// being mistaken for a no-signal result. A full-day outcome is scored only if
// all 390 RTH minutes are present.
const fullPresent=new Set(rth.map(clock));
const full=Array.from({length:390},(_,i)=>570+i).every(m=>fullPresent.has(m));
if(full){
 const result=backtestConservativeOrb(rth,{openingRangeMinutes:5,stopPoints:40,targetPoints:80,
  contracts:1,friction:{roundTripCommissionUsd:40,slippageTicksPerSide:0}});
 const entries=result.trades.filter(t=>{const c=newYorkClock(t.entryTimestampMs);return c.hour*60+c.minute<660;});
 console.log("OCT15_OPENING_RESULT",JSON.stringify({status:"FULL_RTH_SCORED",
  openingTrades:entries.map(t=>({direction:t.direction,entryUtc:new Date(t.entryTimestampMs).toISOString(),
  entry:t.entry,exit:t.exit,exitReason:t.exitReason,netPoints:t.netPnlUsd/20})),
  excluded:result.excluded,noOrders:true}));process.exit(0);
}
// Compute opening-window ORB trigger and next-bar entry without claiming a
// completed trade or fabricating stop/target outcomes.
const first5=opening.filter(b=>clock(b)<575);
const high=Math.max(...first5.map(b=>b.high)),low=Math.min(...first5.map(b=>b.low));
const trigger=opening.find(b=>clock(b)>=575&&(b.close>high||b.close<low));
if(!trigger){
 console.log("OCT15_OPENING_RESULT",JSON.stringify({status:"NO_ORB5_TRIGGER_BY_11",rangeHigh:high,rangeLow:low,
  outcome:"NO_ENTRY",noOrders:true}));process.exit(0);
}
const next=rth.find(b=>b.timestampMs===trigger.timestampMs+60000);
if(!next){
 console.log("OCT15_OPENING_RESULT",JSON.stringify({status:"TRIGGER_NEXT_BAR_UNAVAILABLE",
  triggerUtc:new Date(trigger.timestampMs).toISOString(),outcome:"UNRESOLVED",noOrders:true}));process.exit(0);
}
const entryClock=clock(next);
console.log("OCT15_OPENING_RESULT",JSON.stringify({status:entryClock<660?"ENTRY_DETECTED_OUTCOME_PENDING":"TRIGGER_AFTER_ENTRY_CUTOFF",
 direction:trigger.close>high?"LONG":"SHORT",rangeHigh:high,rangeLow:low,
 triggerUtc:new Date(trigger.timestampMs).toISOString(),entryUtc:new Date(next.timestampMs).toISOString(),
 entryPrice:next.open,entryBefore11:entryClock<660,netPoints:null,
 outcome:"UNRESOLVED_INCOMPLETE_RTH",noOrders:true}));

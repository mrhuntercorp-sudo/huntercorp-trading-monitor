/** Oct 15 London-high rejection check, using verified cached minutes only.
 * Zero API calls. Never interprets missing data as no signal.
 */
import {CachedHistoricalDays} from "../research/historical-cache.js";
import {rthBars} from "../research/level-reclaim.js";
import {newYorkClock} from "../market/time.js";
import {LondonHighRejectionDetector} from "../research/market-intelligence.js";
import {simulateFixedShort} from "../research/fixed-short-feasibility.js";
import type {MinuteBar} from "../market/types.js";
const date="2026-10-15",ticker="NQZ6";
const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("NETWORK_DISABLED");}});
const day=await cache.getDay({ticker,productCode:"NQ"},date);
const previous=await cache.getDay({ticker,productCode:"NQ"},"2026-10-14");
const all=[...previous,...day].sort((a,b)=>a.timestampMs-b.timestampMs);
const minute=(b:MinuteBar)=>{const c=newYorkClock(b.timestampMs);return {date:c.date,m:c.hour*60+c.minute};};
const london=all.filter(b=>{const c=minute(b);return c.date===date&&c.m>=120&&c.m<540;});
const londonTimes=new Set(london.map(b=>minute(b).m));
const opening=rthBars(all,date).filter(b=>{const m=minute(b).m;return m>=570&&m<660;});
const openingTimes=new Set(opening.map(b=>minute(b).m));
const missingLondon=Array.from({length:420},(_,i)=>120+i).filter(m=>!londonTimes.has(m));
const missingOpening=Array.from({length:90},(_,i)=>570+i).filter(m=>!openingTimes.has(m));
console.log("=== TM001 OCT 15 LONDON REJECTION CHECK ===");
console.log("OCT15_LONDON_COVERAGE",JSON.stringify({londonBars:londonTimes.size,requiredLondon:420,
 openingBars:openingTimes.size,requiredOpening:90,missingLondon:missingLondon.length,
 missingOpening:missingOpening.length,requests:0,orders:0}));
if(missingLondon.length){
 console.log("OCT15_LONDON_RESULT",JSON.stringify({status:"INCOMPLETE_LONDON_CONTEXT_NO_SCORING"}));
 process.exit(0);
}
const londonHigh=Math.max(...london.map(b=>b.high));
const detector=new LondonHighRejectionDetector(date,ticker,londonHigh);
const observed=opening.map(b=>detector.consumeCompletedBar(b)).filter(x=>x!==null);
if(missingOpening.length){
 console.log("OCT15_LONDON_RESULT",JSON.stringify({status:"PARTIAL_OPENING_WINDOW",
 londonHigh,observedRejections:observed,missingOpeningMinutes:missingOpening.length,
 noSignalConclusionAllowed:false,tradeOutcomes:"NOT_SCORED"}));process.exit(0);
}
if(!observed.length){
 console.log("OCT15_LONDON_RESULT",JSON.stringify({status:"NO_LONDON_HIGH_REJECTION_BEFORE_11",londonHigh,observations:0}));
 process.exit(0);
}
const signal=observed[0]!;
const rth=rthBars(all,date);
const i=rth.findIndex(b=>b.timestampMs===Date.parse(signal.signalUtc));
const sim=simulateFixedShort(rth,i);
console.log("OCT15_LONDON_RESULT",JSON.stringify({status:sim?"SIMULATED_EXIT":"REJECTION_CONFIRMED_EXIT_DATA_PENDING",
 londonHigh,signal,entry:sim?{utc:new Date(rth[sim.entryIndex]!.timestampMs).toISOString(),
 price:sim.entryPrice,exitPrice:sim.exitPrice,reason:sim.reason,netPoints:sim.netPoints,
 ambiguousBar:sim.ambiguousBar}:null,simulationRules:"40_STOP_40_TARGET_10_BARS_2_POINTS_COST",
 researchOnly:true,independentValidation:false,noOrders:true}));

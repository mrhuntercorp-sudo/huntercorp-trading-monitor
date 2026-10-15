/** Oct 15 frozen-rule audit. Default CACHE ONLY; one approved Massive request if missing.
 * No orders, no phone delivery, no strategy optimization.
 */
import {CachedHistoricalDays} from "../research/historical-cache.js";
import {auditRthCoverage} from "../research/rth-coverage.js";
import {rthBars} from "../research/level-reclaim.js";
import {backtestConservativeOrb} from "../research/conservative-orb.js";
import {MassiveHistoricalProvider} from "../providers/massive.js";
import {makeBriefing} from "../research/market-intelligence.js";
import {IntelligencePipeline} from "../research/intelligence-pipeline.js";
import {simulateFixedShort} from "../research/fixed-short-feasibility.js";
import {newYorkClock} from "../market/time.js";
import type {MinuteBar} from "../market/types.js";
const date="2026-10-15",ticker="NQZ6";
const cacheOnly=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("CACHE_MISS_NO_API_APPROVED");}});
let dayBars:MinuteBar[];
try{dayBars=await cacheOnly.getDay({ticker,productCode:"NQ"},date);}
catch(e){
 if((e as Error).message!=="CACHE_MISS_NO_API_APPROVED")throw e;
 if(process.env.TM001_APPROVE_OCT15_FETCH!=="YES")throw Error("OCT15_CACHE_MISSING: run with TM001_APPROVE_OCT15_FETCH=YES to allow one Massive API request");
 const key=process.env.MASSIVE_API_KEY?.trim();if(!key)throw Error("MASSIVE_API_KEY_MISSING");
 // Existing provider fetches pages automatically; do not use it for a one-request budget.
 const url=new URL("https://api.massive.com/futures/v1/aggs/"+ticker);
 url.searchParams.set("resolution","1min");url.searchParams.set("window_start.gte",date);
 url.searchParams.set("window_start.lt","2026-10-16");url.searchParams.set("sort","window_start.asc");url.searchParams.set("limit","50000");
 const response=await fetch(url,{headers:{Authorization:"Bearer "+key},signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error("MASSIVE_HTTP_"+response.status);
 const payload=await response.json() as {results?:Array<{ticker?:string;window_start?:number;session_end_date?:string;open?:number;high?:number;low?:number;close?:number;volume?:number}>;next_url?:string};
 if(payload.next_url)throw Error("PAGINATION_REQUIRED: one-request limit; no cache write");
 const rows=payload.results??[];
 if(!rows.length)throw Error("OCT15_NO_CANDLES_AVAILABLE_YET");
 const start=Date.parse(date+"T00:00:00Z");
 dayBars=rows.map(r=>{
  if(r.ticker&&r.ticker!==ticker||!r.session_end_date||r.window_start===undefined||
     [r.open,r.high,r.low,r.close,r.volume].some(v=>typeof v!=="number"||!Number.isFinite(v)))throw Error("INVALID_PROVIDER_BAR");
  const timestampMs=Math.floor(r.window_start!/1000000);
  if(timestampMs<start||timestampMs>=start+86400000||timestampMs%60000!==0)throw Error("INVALID_PROVIDER_TIME");
  return {contractTicker:ticker,productCode:"NQ" as const,timestampMs,sessionEndDate:r.session_end_date!,
   open:r.open!,high:r.high!,low:r.low!,close:r.close!,volume:r.volume!};
 }).sort((a,b)=>a.timestampMs-b.timestampMs);
 if(dayBars.some((b,i)=>i>0&&b.timestampMs<=dayBars[i-1]!.timestampMs||
  b.low>Math.min(b.open,b.close)||b.high<Math.max(b.open,b.close)||b.low>b.high||b.volume<0))throw Error("INVALID_PROVIDER_CANDLES");
 // Cache through existing validated writer without a second network request.
 const saver=new CachedHistoricalDays({async getContractMinuteBars(){return dayBars;}});
 dayBars=await saver.getDay({ticker,productCode:"NQ"},date);
}
const rth=rthBars(dayBars,date),coverage=auditRthCoverage(rth,date,ticker);
console.log("=== TM001 OCT 15 FROZEN STRATEGY CHECK ===");
console.log("OCT15_COVERAGE",JSON.stringify({ticker,date,utcBars:dayBars.length,rthBars:rth.length,
 latestUtc:dayBars.length?new Date(dayBars.at(-1)!.timestampMs).toISOString():null,
 coverage:coverage.status,missingRthMinutes:coverage.missingMinutes}));
if(coverage.status!=="COMPLETE"){
 console.log("OCT15_RESULT",JSON.stringify({status:"INCOMPLETE_DATA_NO_TRADE_SCORING",noOrders:true}));
 process.exit(0);
}
const orb=backtestConservativeOrb(rth,{openingRangeMinutes:5,stopPoints:40,targetPoints:80,
 contracts:1,friction:{roundTripCommissionUsd:40,slippageTicksPerSide:0}});
const openingTrades=orb.trades.filter(t=>{const c=newYorkClock(t.entryTimestampMs);return c.hour*60+c.minute<660;});
console.log("OCT15_ORB5",JSON.stringify({status:"FROZEN_RULE",allDayTriggers:orb.trades.length,
 openingWindowTrades:openingTrades.map(t=>({direction:t.direction,entryUtc:new Date(t.entryTimestampMs).toISOString(),
 entry:t.entry,exit:t.exit,exitReason:t.exitReason,netPoints:t.netPnlUsd/20,
 ambiguousExit:t.ambiguousExit,gapThroughStop:t.gapThroughStop})),
 excluded:orb.excluded,notes:"Frozen 40-stop/80-target, next-bar entry, 2-point friction; opening entries only"}));
try{
 const previous=await cacheOnly.getDay({ticker,productCode:"NQ"},"2026-10-14");
 const prior=await cacheOnly.getDay({ticker,productCode:"NQ"},"2026-10-13");
 const all=[...prior,...previous,...dayBars];
 const briefing=makeBriefing(all,date,"2026-10-14",ticker);
 const pipeline=new IntelligencePipeline(date,ticker,briefing.levels.london.high);
 const events=rth.map(b=>pipeline.consume(b).event).filter(e=>e!==null);
 const trades=events.map(event=>{
  const i=rth.findIndex(b=>b.timestampMs===Date.parse(event.observedAtUtc));
  const sim=simulateFixedShort(rth,i);
  return {observedAtUtc:event.observedAtUtc,level:event.level,
   simulation:sim?{netPoints:sim.netPoints,reason:sim.reason,ambiguousBar:sim.ambiguousBar}:null};
 });
 console.log("OCT15_LONDON",JSON.stringify({status:"EXPLORATORY_NOT_VALIDATED",londonHigh:briefing.levels.london.high,
 observations:trades,notes:"Historical in-sample-selected setup; not prospective validated"}));
}catch(e){if((e as Error).message==="CACHE_MISS_NO_API_APPROVED")
 console.log("OCT15_LONDON",JSON.stringify({status:"NOT_SCORED",reason:"OCT13_OR_OCT14_CACHE_MISSING"}));
 else throw e;}
console.log("OCT15_COMPLETE",JSON.stringify({data:"CACHED_AFTER_OPTIONAL_ONE_REQUEST",noOrders:true,noPhoneAlerts:true,noOptimization:true}));

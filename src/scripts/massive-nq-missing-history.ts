import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { CachedHistoricalDays } from "../research/historical-cache.js";
import { auditRthCoverage } from "../research/rth-coverage.js";
import { overnightBars } from "../research/session-features.js";
import { newYorkClock } from "../market/time.js";
import type { FuturesContract, MinuteBar } from "../market/types.js";

console.log("=== TM001 MISSING HISTORY INVENTORY V1 ===");
console.log("READ ONLY | CACHE ONLY | ZERO API CALLS | ZERO SPEND");
const root="data/cache/massive/NQ";
const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("CACHE ONLY: network forbidden");}});
const tickers=(await readdir(root,{withFileTypes:true})).filter(e=>e.isDirectory()&&/^NQ[A-Z][0-9]$/.test(e.name)).map(e=>e.name).sort();
const datePattern=/^[0-9]{4}-[0-9]{2}-[0-9]{2}[.]json$/;
const contractBars=new Map<string,MinuteBar[]>();
let files=0;
for(const ticker of tickers){
 const contract:FuturesContract={ticker,productCode:"NQ"};
 const dates=(await readdir(join(root,ticker))).filter(name=>datePattern.test(name)).map(name=>name.slice(0,10)).sort();
 const bars:MinuteBar[]=[];
 for(const date of dates){bars.push(...await cache.getDay(contract,date));files++;}
 bars.sort((a,b)=>a.timestampMs-b.timestampMs);
 if(new Set(bars.map(b=>b.timestampMs)).size!==bars.length)throw Error("Duplicate timestamp in "+ticker);
 contractBars.set(ticker,bars);
}
if(!files)throw Error("NO_CACHE_FILES: fail closed");
const start="2026-07-01",end="2026-10-02";
const ms=86400000;
const day=(date:string)=>new Date(date+"T00:00:00Z").getTime();
const iso=(timestamp:number)=>new Date(timestamp).toISOString().slice(0,10);
const expectedTicker=(date:string)=>date<"2026-09-14"?"NQU6":"NQZ6";
const knownClosed=new Map<string,string>([
 ["2026-07-03","CME_INDEPENDENCE_DAY_OBSERVED_VERIFY_EXACT_HOURS"],
 ["2026-09-07","CME_LABOR_DAY_VERIFY_EXACT_HOURS"]
]);
const statusCounts=new Map<string,number>();
const missing:{date:string;ticker:string;reason:string}[]=[];
let eligible=0;
for(let t=day(start);t<=day(end);t+=ms){
 const date=iso(t),weekday=new Date(t).getUTCDay();
 if(weekday===0||weekday===6)continue;
 const ticker=expectedTicker(date);
 const bars=contractBars.get(ticker)??[];
 const rth=bars.filter(b=>{const c=newYorkClock(b.timestampMs),m=c.hour*60+c.minute;return c.date===date&&m>=570&&m<960;});
 const on=overnightBars(bars,date);
 const rthStatus=auditRthCoverage(rth,date,ticker).status;
 const overnightComplete=on.length===930&&on.every((b,i)=>i===0||b.timestampMs-on[i-1]!.timestampMs===60000);
 let status:string;
 if(knownClosed.has(date))status="HOLIDAY_REVIEW";
 else if(date==="2026-09-14")status="ROLLOVER_REVIEW";
 else if(rthStatus==="COMPLETE"&&overnightComplete){status="COMPLETE";eligible++;}
 else if(rth.length===0&&on.length===0)status="MISSING_BOTH";
 else if(rthStatus!=="COMPLETE"&&overnightComplete)status="INCOMPLETE_RTH";
 else if(rthStatus==="COMPLETE"&&!overnightComplete)status="INCOMPLETE_OVERNIGHT";
 else status="INCOMPLETE_BOTH";
 statusCounts.set(status,(statusCounts.get(status)??0)+1);
 if(status!=="COMPLETE"){
  const entry={date,ticker,reason:status};
  missing.push(entry);
  console.log("NEEDS_REVIEW "+JSON.stringify({...entry,rthMinutes:rth.length,overnightMinutes:on.length,holidayNote:knownClosed.get(date)??null}));
 }
}
console.log("INVENTORY_SUMMARY "+JSON.stringify({windowStart:start,windowEnd:end,cacheFilesChecked:files,completeSessions:eligible,needsReview:missing.length,byStatus:Object.fromEntries(statusCounts),requestedApiCalls:0,estimatedApiCostUsd:null,rollPolicyApproved:false,holidayScheduleVerified:false,warning:"Contract schedule and holidays are provisional; verify exchange calendar and causal roll before acquisition"}));
console.log("TM001 MISSING HISTORY INVENTORY: COMPLETE (NO DATA ACQUISITION)");

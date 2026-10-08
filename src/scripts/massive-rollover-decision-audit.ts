import { CachedHistoricalDays } from "../research/historical-cache.js";
import { auditRthCoverage } from "../research/rth-coverage.js";
import { decideRolloverForTradeDate, type VolumeObservation } from "../research/rollover-decision.js";
import { newYorkClock } from "../market/time.js";
import { assessSparseMinutes, type SparseMinuteAssessment } from "../research/sparse-minute-assessment.js";
import type { FuturesContract } from "../market/types.js";

// Deliberately cache-only: any missing file causes a hard failure, never a provider request.
const cache = new CachedHistoricalDays({async getContractMinuteBars() {
 throw new Error("CACHE ONLY: missing historical day; no API requests permitted");
}});
const dates=["2026-09-08","2026-09-09","2026-09-10","2026-09-11","2026-09-14","2026-09-15"];
const contracts:FuturesContract[]=[{ticker:"NQU6",productCode:"NQ"},{ticker:"NQZ6",productCode:"NQ"}];
const observations:VolumeObservation[]=[];
console.log("=== TM001 CACHE-ONLY ROLLOVER DECISION AUDIT ===");
console.log("Verified cache, no APIs, no trades, no automatic rollover approval.");
for(const date of dates) {
 const records=[] as {ticker:string;volume:number;complete:boolean;missing:number;classification:SparseMinuteAssessment}[];
 for(const contract of contracts) {
  const bars=await cache.getDay(contract,date);
  const coverage=auditRthCoverage(bars,date,contract.ticker);
  const volume=bars.filter(b=>{
   const c=newYorkClock(b.timestampMs),m=c.hour*60+c.minute;
   return c.date===date&&m>=570&&m<960;
  }).reduce((n,b)=>n+b.volume,0);
  if(!Number.isSafeInteger(volume)||volume<0) throw new Error("Invalid observed volume");
  const missingTimestamps:number[]=[];
 for(const range of coverage.missingRanges)
  for(let t=Date.parse(range.startUtc);t<=Date.parse(range.endUtc);t+=60000) missingTimestamps.push(t);
 const classification=contract.ticker==="NQU6"
  ? assessSparseMinutes(missingTimestamps,[])
  : assessSparseMinutes([],missingTimestamps);
 records.push({ticker:contract.ticker,volume,complete:classification.status==="COMPLETE",
  missing:coverage.missingMinutes,classification});
 }
 const [sep,dec]=records;
 if(!sep||!dec) throw new Error("Missing contract");
 observations.push({date,septemberTicker:sep.ticker,decemberTicker:dec.ticker,
  septemberVolume:sep.volume,decemberVolume:dec.volume,
  septemberComplete:sep.complete,decemberComplete:dec.complete});
 console.log(JSON.stringify({date,observed:records}));
}
for(const tradeDate of ["2026-09-09","2026-09-10","2026-09-11","2026-09-14","2026-09-15","2026-09-16"]) {
 const prior=observations.filter(o=>o.date<tradeDate);
 const decision=decideRolloverForTradeDate(tradeDate,prior);
 console.log("DECISION",JSON.stringify(decision));
 if(tradeDate==="2026-09-14"&&decision.status!=="REVIEW_REQUIRED")
  throw new Error("Sept 14 must be blocked by Sept 11 incomplete coverage");
 if(tradeDate==="2026-09-15"&&(decision.status!=="SELECTED"||decision.selectedTicker!=="NQZ6"||decision.evidenceDate!=="2026-09-14"))
  throw new Error("Sept 15 must select NQZ6 using Sept 14 evidence");
}
console.log("TM001 CACHE-ONLY ROLLOVER INTEGRATION: GREEN (RESEARCH ONLY; POLICY REVIEW REQUIRED)");

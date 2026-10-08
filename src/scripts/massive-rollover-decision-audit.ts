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
 const raw=[] as {ticker:string;volume:number;missing:number;missingTimestamps:number[]}[];
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
  raw.push({ticker:contract.ticker,volume,missing:coverage.missingMinutes,missingTimestamps});
 }
 const [sep,dec]=raw;
 if(!sep||!dec) throw new Error("Missing contract");
 const classification=assessSparseMinutes(sep.missingTimestamps,dec.missingTimestamps);
 const records=raw.map(r=>({ticker:r.ticker,volume:r.volume,complete:classification.status==="COMPLETE",missing:r.missing,classification}));
 observations.push({date,septemberTicker:sep.ticker,decemberTicker:dec.ticker,
  septemberVolume:sep.volume,decemberVolume:dec.volume,
  septemberComplete:sep.missing===0&&classification.status==="COMPLETE",
  decemberComplete:dec.missing===0&&classification.status==="COMPLETE"});
 console.log(JSON.stringify({date,observed:records}));
 if(date==="2026-09-11"&&classification.status!=="SHARED_GAP_QUARANTINE")
  throw new Error("Sept 11 shared gap must remain quarantined");
}

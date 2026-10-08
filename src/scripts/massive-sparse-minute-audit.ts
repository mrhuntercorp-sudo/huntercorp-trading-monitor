import { CachedHistoricalDays } from "../research/historical-cache.js";
import { auditRthCoverage } from "../research/rth-coverage.js";
import { newYorkClock } from "../market/time.js";
import type { FuturesContract, MinuteBar } from "../market/types.js";

const cache=new CachedHistoricalDays({async getContractMinuteBars(){
 throw new Error("CACHE ONLY: missing day; no API request permitted");
}});
const dates=["2026-09-08","2026-09-09","2026-09-10","2026-09-11","2026-09-14","2026-09-15"];
const contracts:FuturesContract[]=[{ticker:"NQU6",productCode:"NQ"},{ticker:"NQZ6",productCode:"NQ"}];
const inRth=(b:MinuteBar,date:string)=>{
 const c=newYorkClock(b.timestampMs),m=c.hour*60+c.minute;
 return c.date===date&&m>=570&&m<960;
};
console.log("=== TM001 RTH SPARSE MINUTE FORENSICS ===");
console.log("Cache-only; no missing-bar imputation; provider outage vs zero trades unresolved.");
for(const date of dates) {
 const rows=[] as {ticker:string;observed:number;missing:number;volume:number;missingRanges:{startUtc:string;endUtc:string;minutes:number}[]}[];
 for(const contract of contracts) {
  const bars=await cache.getDay(contract,date);
  const coverage=auditRthCoverage(bars,date,contract.ticker);
  const volume=bars.filter(b=>inRth(b,date)).reduce((n,b)=>n+b.volume,0);
  if(!Number.isSafeInteger(volume)||volume<0) throw new Error("Invalid volume");
  rows.push({ticker:contract.ticker,observed:coverage.observedMinutes,
   missing:coverage.missingMinutes,volume,missingRanges:coverage.missingRanges});
 }
 const [sep,dec]=rows;
 if(!sep||!dec) throw new Error("Missing contract");
 const sepMissing=new Set<number>(),decMissing=new Set<number>();
 for(const range of sep.missingRanges) for(let t=Date.parse(range.startUtc);t<=Date.parse(range.endUtc);t+=60000) sepMissing.add(t);
 for(const range of dec.missingRanges) for(let t=Date.parse(range.startUtc);t<=Date.parse(range.endUtc);t+=60000) decMissing.add(t);
 const shared=[...sepMissing].filter(t=>decMissing.has(t)).sort((a,b)=>a-b);
 const onlySep=sepMissing.size-shared.length,onlyDec=decMissing.size-shared.length;
 const longSharedRanges:{startUtc:string;endUtc:string;minutes:number}[]=[];
 for(const t of shared) {
  const last=longSharedRanges.at(-1);
  if(last&&Date.parse(last.endUtc)+60000===t){last.endUtc=new Date(t).toISOString();last.minutes++;}
  else longSharedRanges.push({startUtc:new Date(t).toISOString(),endUtc:new Date(t).toISOString(),minutes:1});
 }
 console.log(JSON.stringify({date,contracts:rows,sharedMissingMinutes:shared.length,
  missingOnlyNQU6:onlySep,missingOnlyNQZ6:onlyDec,sharedMissingRanges:longSharedRanges,
  interpretation:"UNDETERMINED: zero-trade vs missing provider records"}));
 if(date==="2026-09-11"&&shared.length<119) throw new Error("Shared Sept 11 gap not reproduced");
}
console.log("TM001 SPARSE MINUTE FORENSICS: GREEN (DESCRIPTIVE; ROLLOVER POLICY NOT APPROVED)");

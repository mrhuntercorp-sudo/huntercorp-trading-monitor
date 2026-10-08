import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { CachedHistoricalDays } from "../research/historical-cache.js";
import { newYorkClock } from "../market/time.js";
import type { FuturesContract, MinuteBar } from "../market/types.js";

export function expectedOvernightMinutes(tradeDate:string):number[]{
 const target=Date.parse(tradeDate+"T00:00:00Z");
 if(!Number.isFinite(target)||new Date(target).toISOString().slice(0,10)!==tradeDate)throw Error("Invalid trade date");
 const prior=new Date(target-86400000).toISOString().slice(0,10);
 const expected:number[]=[];
 for(let t=target-2*86400000;t<target+86400000;t+=60000){
  const c=newYorkClock(t),m=c.hour*60+c.minute;
  if((c.date===prior&&m>=1080)||(c.date===tradeDate&&m<570))expected.push(t);
 }
 return expected;
}
export function contiguousMissingRanges(expected:readonly number[],present:ReadonlySet<number>){
 const missing=expected.filter(t=>!present.has(t));
 const ranges:{startUtc:string;endExclusiveUtc:string;minutes:number}[]=[];
 for(const t of missing){
  const last=ranges.at(-1);
  if(last&&Date.parse(last.endExclusiveUtc)===t){
   last.endExclusiveUtc=new Date(t+60000).toISOString();last.minutes++;
  }else ranges.push({startUtc:new Date(t).toISOString(),endExclusiveUtc:new Date(t+60000).toISOString(),minutes:1});
 }
 return ranges;
}
const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("CACHE_ONLY: network forbidden");}});
const cycles=[
 {cycle:"2025-12",ticker:"NQH6",roll:"2025-12-15"},
 {cycle:"2026-03",ticker:"NQM6",roll:"2026-03-16"},
 {cycle:"2026-06",ticker:"NQU6",roll:"2026-06-15"},
 {cycle:"2026-09",ticker:"NQZ6",roll:"2026-09-14"}
] as const;
console.log("=== TM001 EXACT OVERNIGHT CACHE INVENTORY ===");
console.log("READ ONLY | ZERO APIs | ZERO CACHE CREATION | NO DATA IMPUTATION");
for(const c of cycles){
 const expected=expectedOvernightMinutes(c.roll);
 const dates=[...new Set(expected.map(t=>new Date(t).toISOString().slice(0,10)))];
 const directory=join("data/cache/massive/NQ",c.ticker);
 const names=new Set(await readdir(directory));
 const available=dates.filter(d=>names.has(d+".json"));
 const absent=dates.filter(d=>!names.has(d+".json"));
 const contract:FuturesContract={ticker:c.ticker,productCode:"NQ"};
 const days=await Promise.all(available.map(d=>cache.getDay(contract,d)));
 const bars:MinuteBar[]=days.flat();
 const present=new Set(bars.map(b=>b.timestampMs));
 const ranges=contiguousMissingRanges(expected,present);
 const missingMinutes=ranges.reduce((sum,r)=>sum+r.minutes,0);
 const status=missingMinutes===0?"COMPLETE":"REVIEW_REQUIRED";
 console.log("CACHE_INVENTORY "+JSON.stringify({cycle:c.cycle,ticker:c.ticker,tradeDate:c.roll,
  requiredUtcDates:dates,availableUtcDates:available,absentUtcDates:absent,
  expectedMinutes:expected.length,presentMinutes:expected.length-missingMinutes,
  missingMinutes,missingRanges:ranges,status}));
}
console.log("TM001 EXACT OVERNIGHT CACHE INVENTORY: GREEN (DESCRIPTIVE; NO DATA APPROVAL)");

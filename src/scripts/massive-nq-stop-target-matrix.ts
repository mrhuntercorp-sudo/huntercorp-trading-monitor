import { CachedHistoricalDays } from "../research/historical-cache.js";
import { auditRthCoverage } from "../research/rth-coverage.js";
import { overnightBars } from "../research/session-features.js";
import { backtestNaiveOrb } from "../research/backtest.js";
import { newYorkClock } from "../market/time.js";
import type { FuturesContract, MinuteBar } from "../market/types.js";

const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("CACHE ONLY: no network permitted");}});
const contract:FuturesContract={ticker:"NQZ6",productCode:"NQ"};
const dates=["2026-09-21","2026-09-22","2026-09-23","2026-09-24","2026-09-25","2026-09-28","2026-09-29","2026-09-30","2026-10-01","2026-10-02"];
const fetchDates=["2026-09-20",...dates.slice(0,5),"2026-09-27",...dates.slice(5)];
const combinations=[[25,25],[20,40],[20,80],[30,60],[40,40],[40,80],[40,120],[60,80],[60,120]] as const;
const all:MinuteBar[]=[];
console.log("=== TM001 NQ STOP / TARGET MATRIX V1 ===");
console.log("CACHE ONLY | FIXED ENTRIES PER ORB WINDOW | NO OPTIMIZATION APPROVAL");
for(const date of fetchDates)all.push(...await cache.getDay(contract,date));
all.sort((a,b)=>a.timestampMs-b.timestampMs);
if(new Set(all.map(b=>b.timestampMs)).size!==all.length)throw Error("Duplicate cached timestamps");
const rth=(date:string)=>all.filter(b=>{const c=newYorkClock(b.timestampMs),m=c.hour*60+c.minute;return c.date===date&&m>=570&&m<960;});
const validDates:string[]=[];
for(const date of dates){
 const day=rth(date),coverage=auditRthCoverage(day,date,contract.ticker),overnight=overnightBars(all,date);
 const overnightComplete=overnight.length===930&&new Set(overnight.map(b=>b.timestampMs)).size===930&&overnight.every((b,i)=>i===0||b.timestampMs-overnight[i-1]!.timestampMs===60000);
 if(coverage.status==="COMPLETE"&&overnightComplete)validDates.push(date);
 else console.log("QUARANTINED "+JSON.stringify({date,rth:coverage.observedMinutes,overnight:overnight.length}));
}
const validBars=all.filter(b=>validDates.includes(newYorkClock(b.timestampMs).date)&&(()=>{const c=newYorkClock(b.timestampMs),m=c.hour*60+c.minute;return m>=570&&m<960;})());
const friction={roundTripCommissionUsd:6,slippageTicksPerSide:1};
for(const window of [5,15] as const){
 const reference=backtestNaiveOrb(validBars,{openingRangeMinutes:window,stopPoints:40,targetPoints:80,contracts:1,friction});
 const referenceEntries=reference.map(t=>t.date+"|"+t.direction+"|"+t.entry).join(",");
 const results=[];
 for(const [stopPoints,targetPoints] of combinations){
  const trades=backtestNaiveOrb(validBars,{openingRangeMinutes:window,stopPoints,targetPoints,contracts:1,friction});
  if(trades.map(t=>t.date+"|"+t.direction+"|"+t.entry).join(",")!==referenceEntries)throw Error("ENTRY_DRIFT: stop/target changed entries");
  let equity=0,peak=0,maxDrawdownUsd=0;
  for(const t of trades){equity+=t.netPnlUsd;peak=Math.max(peak,equity);maxDrawdownUsd=Math.max(maxDrawdownUsd,peak-equity);}
  const targets=trades.filter(t=>t.exitReason==="TARGET").length;
  const stops=trades.filter(t=>t.exitReason==="STOP").length;
  const sessionEnds=trades.filter(t=>t.exitReason==="SESSION_END").length;
  const winners=trades.filter(t=>t.netPnlUsd>0).length;
  const netUsd=trades.reduce((sum,t)=>sum+t.netPnlUsd,0);
  const row={openingRangeMinutes:window,stopPoints,targetPoints,ratio:targetPoints/stopPoints,trades:trades.length,targets,stops,sessionEnds,winners,winRate:trades.length?winners/trades.length:null,netUsd,avgNetUsd:trades.length?netUsd/trades.length:null,maxDrawdownUsd,entryInvariant:true};
  results.push(row);
  console.log("MATRIX "+JSON.stringify(row));
 }
 console.log("WINDOW_SUMMARY "+JSON.stringify({openingRangeMinutes:window,eligibleDates:validDates.length,combinations:results.length,warning:"Exploratory in-sample only; not a trading recommendation"}));
}
console.log("TM001 STOP TARGET MATRIX V1: COMPLETE (DESCRIPTIVE ONLY)");

import { CachedHistoricalDays } from "../research/historical-cache.js";
import { backtestNaiveOrb } from "../research/backtest.js";
import { backtestConservativeOrb } from "../research/conservative-orb.js";
import { auditRthCoverage } from "../research/rth-coverage.js";
import { newYorkClock } from "../market/time.js";
import type { FuturesContract, MinuteBar } from "../market/types.js";

const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("NETWORK_DISABLED: CACHE_ONLY");}});
const contract:FuturesContract={ticker:"NQZ6",productCode:"NQ"};
const dates=["2026-09-21","2026-09-22","2026-09-23","2026-09-24","2026-09-25","2026-09-28","2026-09-29","2026-09-30","2026-10-01","2026-10-02"];
const utcDates=["2026-09-20",...dates.slice(0,5),"2026-09-27",...dates.slice(5)];
const all:MinuteBar[]=[];
console.log("=== TM001 NQ EXECUTION MODEL COMPARISON ===");
console.log("CACHE ONLY | NO API | NO WRITES | NO TRADES | PROVISIONAL SCHEDULE/ROLL");
for(const date of utcDates) all.push(...await cache.getDay(contract,date));
all.sort((a,b)=>a.timestampMs-b.timestampMs);
if(new Set(all.map(b=>b.timestampMs)).size!==all.length)throw Error("DUPLICATE_CACHED_TIMESTAMPS");
const eligible:string[]=[];
const excluded:{date:string;reason:string}[]=[];
for(const date of dates){
 const day=all.filter(b=>{const c=newYorkClock(b.timestampMs),m=c.hour*60+c.minute;return c.date===date&&m>=570&&m<960;});
 const coverage=auditRthCoverage(day,date,contract.ticker);
 if(coverage.status==="COMPLETE")eligible.push(date);
 else excluded.push({date,reason:"INCOMPLETE_RTH"});
}
const eligibleSet=new Set(eligible);
const rth=all.filter(b=>{const c=newYorkClock(b.timestampMs),m=c.hour*60+c.minute;return eligibleSet.has(c.date)&&m>=570&&m<960;});
const friction={roundTripCommissionUsd:6,slippageTicksPerSide:1};
const config={openingRangeMinutes:5 as const,stopPoints:40,targetPoints:40,contracts:1,friction};
const original=backtestNaiveOrb(rth,config);
const strict=backtestConservativeOrb(rth,config);
const byDate=new Map(strict.trades.map(t=>[t.date,t]));
function summary(trades:readonly {netPnlUsd:number}[]){
 return {trades:trades.length,winners:trades.filter(t=>t.netPnlUsd>0).length,
  losers:trades.filter(t=>t.netPnlUsd<0).length,netUsd:trades.reduce((sum,t)=>sum+t.netPnlUsd,0)};
}
console.log("ELIGIBILITY "+JSON.stringify({candidateDates:dates.length,eligibleDates:eligible.length,excluded,eligible,warning:"RTH template completeness only; exchange schedule and rollover unverified"}));
console.log("COMPARISON "+JSON.stringify({config,original:summary(original),conservative:summary(strict.trades),
 deltaNetUsd:summary(strict.trades).netUsd-summary(original).netUsd,
 ambiguousExits:strict.trades.filter(t=>t.ambiguousExit).length,
 gapThroughStops:strict.trades.filter(t=>t.gapThroughStop).length,
 conservativeExcluded:strict.excluded,status:"DESCRIPTIVE_ONLY_NOT_VALIDATED"}));
for(const old of original){
 const newer=byDate.get(old.date);
 console.log("TRADE_PAIR "+JSON.stringify({date:old.date,direction:old.direction,
 originalEntry:old.entry,originalExit:old.exit,originalReason:old.exitReason,originalNetUsd:old.netPnlUsd,
 conservativeEntry:newer?.entry??null,conservativeExit:newer?.exit??null,
 conservativeReason:newer?.exitReason??null,conservativeNetUsd:newer?.netPnlUsd??null,
 entryDifferencePoints:newer?newer.entry-old.entry:null,
 ambiguousExit:newer?.ambiguousExit??null,gapThroughStop:newer?.gapThroughStop??null}));
}
console.log("TM001 EXECUTION COMPARISON COMPLETE (NO STRATEGY APPROVAL)");

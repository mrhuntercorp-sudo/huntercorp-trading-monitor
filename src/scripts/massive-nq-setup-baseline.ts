import { CachedHistoricalDays } from "../research/historical-cache.js";
import { auditRthCoverage } from "../research/rth-coverage.js";
import { overnightBars } from "../research/session-features.js";
import { backtestNaiveOrb } from "../research/backtest.js";
import { newYorkClock } from "../market/time.js";
import type { FuturesContract, MinuteBar } from "../market/types.js";

const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("CACHE ONLY: provider requests forbidden");}});
const contract:FuturesContract={ticker:"NQZ6",productCode:"NQ"};
const dates=["2026-09-21","2026-09-22","2026-09-23","2026-09-24","2026-09-25","2026-09-28","2026-09-29","2026-09-30","2026-10-01","2026-10-02"];
const utcDates=["2026-09-20",...dates.slice(0,5),"2026-09-27",...dates.slice(5)];
const all:MinuteBar[]=[];
console.log("=== TM001 NQ CACHE-ONLY SETUP BASELINE ===");
console.log("DESCRIPTIVE SAMPLE | 10 DATES | SINGLE CONTRACT NQZ6 | NO API | NO TRADE APPROVAL");
for(const date of utcDates)all.push(...await cache.getDay(contract,date));
all.sort((a,b)=>a.timestampMs-b.timestampMs);
if(new Set(all.map(b=>b.timestampMs)).size!==all.length)throw Error("Duplicate timestamps across cached days");
const friction={roundTripCommissionUsd:6,slippageTicksPerSide:1};
const rth=(date:string)=>all.filter(b=>{const c=newYorkClock(b.timestampMs),m=c.hour*60+c.minute;return c.date===date&&m>=570&&m<960;});
const completeDates:string[]=[];
for(const date of dates){
 const day=rth(date);
 const coverage=auditRthCoverage(day,date,contract.ticker);
 const overnight=overnightBars(all,date);
 const onTimes=new Set(overnight.map(b=>b.timestampMs));
 const overnightComplete=overnight.length===930&&onTimes.size===930&&overnight.every((b,i)=>i===0||b.timestampMs-overnight[i-1]!.timestampMs===60000);
 const valid=coverage.status==="COMPLETE"&&overnightComplete;
 console.log("DAY "+JSON.stringify({date,rthMinutes:coverage.observedMinutes,overnightMinutes:overnight.length,overnightComplete,status:valid?"ELIGIBLE":"QUARANTINED",overnightHigh:overnightComplete?Math.max(...overnight.map(b=>b.high)):null,overnightLow:overnightComplete?Math.min(...overnight.map(b=>b.low)):null,opening5High:valid?Math.max(...day.slice(0,5).map(b=>b.high)):null,opening5Low:valid?Math.min(...day.slice(0,5).map(b=>b.low)):null}));
 if(valid)completeDates.push(date);
}
const validBars=all.filter(b=>completeDates.includes(newYorkClock(b.timestampMs).date)&&rthClock(b));
function rthClock(b:MinuteBar){const c=newYorkClock(b.timestampMs),m=c.hour*60+c.minute;return m>=570&&m<960;}
for(const minutes of [5,15] as const){
 const trades=backtestNaiveOrb(validBars,{openingRangeMinutes:minutes,stopPoints:40,targetPoints:80,contracts:1,friction});
 const winners=trades.filter(t=>t.netPnlUsd>0).length;
 const netUsd=trades.reduce((n,t)=>n+t.netPnlUsd,0);
 console.log("ORB_BASELINE "+JSON.stringify({openingRangeMinutes:minutes,eligibleDates:completeDates.length,trades:trades.length,winners,netUsd,frictionAssumption:"$6 round trip plus one tick per side",stopPoints:40,targetPoints:80,status:"DESCRIPTIVE_ONLY",tradeRows:trades}));
}
console.log("TM001 NQ SETUP BASELINE: COMPLETE (NO STRATEGY APPROVAL)");

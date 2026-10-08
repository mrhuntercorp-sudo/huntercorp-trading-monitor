import { CachedHistoricalDays } from "../research/historical-cache.js";
import { auditRthCoverage } from "../research/rth-coverage.js";
import { overnightBars } from "../research/session-features.js";
import { backtestNaiveOrb } from "../research/backtest.js";
import { newYorkClock } from "../market/time.js";
import type { FuturesContract, MinuteBar } from "../market/types.js";

const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("CACHE ONLY: network forbidden");}});
const contract:FuturesContract={ticker:"NQZ6",productCode:"NQ"};
const dates=["2026-09-21","2026-09-22","2026-09-23","2026-09-24","2026-09-25","2026-09-28","2026-09-29","2026-09-30","2026-10-01","2026-10-02"];
const fetchDates=["2026-09-20",...dates.slice(0,5),"2026-09-27",...dates.slice(5)];
const all:MinuteBar[]=[];
console.log("=== TM001 LIQUIDITY SWEEP / FAILED BREAKOUT V2 ===");
console.log("CACHE ONLY | OBSERVATIONS END AT ENTRY | NO SIGNAL APPROVAL");
for(const date of fetchDates)all.push(...await cache.getDay(contract,date));
all.sort((a,b)=>a.timestampMs-b.timestampMs);
if(new Set(all.map(b=>b.timestampMs)).size!==all.length)throw Error("Duplicate timestamps");
const rth=(date:string)=>all.filter(b=>{const c=newYorkClock(b.timestampMs),m=c.hour*60+c.minute;return c.date===date&&m>=570&&m<960;});
const eligible:MinuteBar[]=[];
type Feature={date:string;direction:"LONG"|"SHORT";entry:number;entryTimeEt:string;overnightHigh:number;overnightLow:number;highSweep:boolean;lowSweep:boolean;highRejection:boolean;lowRejection:boolean;failedOpeningBreakoutBeforeEntry:boolean;barsBeforeEntry:number};
const features=new Map<string,Feature>();
for(const date of dates){
 const day=rth(date),on=overnightBars(all,date),coverage=auditRthCoverage(day,date,contract.ticker);
 const complete=on.length===930&&new Set(on.map(b=>b.timestampMs)).size===930&&on.every((b,i)=>i===0||b.timestampMs-on[i-1]!.timestampMs===60000);
 if(coverage.status!=="COMPLETE"||!complete){console.log("QUARANTINED "+date);continue;}
 const opening=day.slice(0,5),high=Math.max(...opening.map(b=>b.high)),low=Math.min(...opening.map(b=>b.low));
 const idx=day.findIndex((b,i)=>i>=5&&(b.close>high||b.close<low));
 if(idx<0){console.log("NO_ENTRY "+date);continue;}
 const trigger=day[idx]!,direction=trigger.close>high?"LONG":"SHORT";
 const overnightHigh=Math.max(...on.map(b=>b.high)),overnightLow=Math.min(...on.map(b=>b.low));
 const before=day.slice(0,idx+1);
 const highSweep=before.some(b=>b.high>overnightHigh);
 const lowSweep=before.some(b=>b.low<overnightLow);
 const highRejection=before.some(b=>b.high>overnightHigh&&b.close<overnightHigh);
 const lowRejection=before.some(b=>b.low<overnightLow&&b.close>overnightLow);
 // A prior intrabar breach that closes back inside the opening range; excludes the entry bar.
 const failedOpeningBreakoutBeforeEntry=day.slice(5,idx).some(b=>(b.high>high&&b.close<=high)||(b.low<low&&b.close>=low));
 const clock=newYorkClock(trigger.timestampMs);
 features.set(date,{date,direction,entry:trigger.close,entryTimeEt:String(clock.hour).padStart(2,"0")+":"+String(clock.minute).padStart(2,"0"),overnightHigh,overnightLow,highSweep,lowSweep,highRejection,lowRejection,failedOpeningBreakoutBeforeEntry,barsBeforeEntry:before.length});
 eligible.push(...day);
}
const friction={roundTripCommissionUsd:6,slippageTicksPerSide:1};
const baseline=backtestNaiveOrb(eligible,{openingRangeMinutes:5,stopPoints:40,targetPoints:40,contracts:1,friction});
const baselineKey=baseline.map(t=>t.date+"|"+t.direction+"|"+t.entry).join(",");
for(const [stopPoints,targetPoints] of [[25,25],[40,40]] as const){
 const trades=backtestNaiveOrb(eligible,{openingRangeMinutes:5,stopPoints,targetPoints,contracts:1,friction});
 if(trades.map(t=>t.date+"|"+t.direction+"|"+t.entry).join(",")!==baselineKey)throw Error("ENTRY_DRIFT");
 const groups=new Map<string,{trades:number;wins:number;netUsd:number}>();
 for(const trade of trades){
  const f=features.get(trade.date);if(!f)throw Error("Missing point-in-time feature");
  console.log("DAY "+JSON.stringify({stopPoints,targetPoints,...f,outcome:trade.exitReason,netUsd:trade.netPnlUsd}));
  const flags={highSweep:f.highSweep,lowSweep:f.lowSweep,highRejection:f.highRejection,lowRejection:f.lowRejection,failedOpeningBreakoutBeforeEntry:f.failedOpeningBreakoutBeforeEntry};
  for(const [name,value] of Object.entries(flags)){
   const key=name+"="+String(value);const g=groups.get(key)??{trades:0,wins:0,netUsd:0};
   g.trades++;g.wins+=Number(trade.netPnlUsd>0);g.netUsd+=trade.netPnlUsd;groups.set(key,g);
  }
 }
 for(const [pattern,g] of groups)console.log("PATTERN "+JSON.stringify({stopPoints,targetPoints,pattern,...g,winRate:g.wins/g.trades,warning:"Exploratory 10-day in-sample association; not predictive"}));
 console.log("SETUP_SUMMARY "+JSON.stringify({stopPoints,targetPoints,eligibleDates:features.size,trades:trades.length}));
}
console.log("TM001 LIQUIDITY SWEEP V2: COMPLETE (NO STRATEGY APPROVAL)");

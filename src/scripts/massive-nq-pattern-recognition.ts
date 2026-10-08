import { CachedHistoricalDays } from "../research/historical-cache.js";
import { auditRthCoverage } from "../research/rth-coverage.js";
import { overnightBars } from "../research/session-features.js";
import { backtestNaiveOrb } from "../research/backtest.js";
import { newYorkClock } from "../market/time.js";
import type { FuturesContract, MinuteBar } from "../market/types.js";

const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("CACHE ONLY: no network");}});
const contract:FuturesContract={ticker:"NQZ6",productCode:"NQ"};
const dates=["2026-09-21","2026-09-22","2026-09-23","2026-09-24","2026-09-25","2026-09-28","2026-09-29","2026-09-30","2026-10-01","2026-10-02"];
const fetchDates=["2026-09-20",...dates.slice(0,5),"2026-09-27",...dates.slice(5)];
const all:MinuteBar[]=[];
console.log("=== TM001 PATTERN RECOGNITION V1 ===");
console.log("CACHE ONLY | POINT-IN-TIME FEATURES | DESCRIPTIVE, NOT PREDICTIVE");
for(const date of fetchDates)all.push(...await cache.getDay(contract,date));
all.sort((a,b)=>a.timestampMs-b.timestampMs);
if(new Set(all.map(b=>b.timestampMs)).size!==all.length)throw Error("Duplicate timestamps");
const rth=(date:string)=>all.filter(b=>{const c=newYorkClock(b.timestampMs),m=c.hour*60+c.minute;return c.date===date&&m>=570&&m<960;});
const eligible:MinuteBar[]=[];
const features=new Map<string,{overnightDirection:string;openingWidth:string;breakoutLocation:string;openingPoints:number;overnightPoints:number}>();
for(const date of dates){
 const day=rth(date),on=overnightBars(all,date),coverage=auditRthCoverage(day,date,contract.ticker);
 const complete=on.length===930&&new Set(on.map(b=>b.timestampMs)).size===930&&on.every((b,i)=>i===0||b.timestampMs-on[i-1]!.timestampMs===60000);
 if(coverage.status!=="COMPLETE"||!complete){console.log("QUARANTINE "+date);continue;}
 const opening=day.slice(0,5),hi=Math.max(...opening.map(b=>b.high)),lo=Math.min(...opening.map(b=>b.low));
 const triggerIndex=day.findIndex((b,i)=>i>=5&&(b.close>hi||b.close<lo));
 if(triggerIndex<0){console.log("NO_BREAKOUT "+date);continue;}
 const trigger=day[triggerIndex]!,overnightHigh=Math.max(...on.map(b=>b.high)),overnightLow=Math.min(...on.map(b=>b.low));
 const overnightOpen=on[0]!.open,overnightClose=on.at(-1)!.close;
 const overnightDirection=overnightClose>overnightOpen?"UP":overnightClose<overnightOpen?"DOWN":"FLAT";
 const openingPoints=hi-lo,overnightPoints=overnightHigh-overnightLow;
 const openingWidth=openingPoints<40?"NARROW_LT40":openingPoints<80?"MEDIUM_40_80":"WIDE_GE80";
 const direction=trigger.close>hi?"LONG":"SHORT";
 const breakoutLocation=direction==="LONG"?(trigger.close>=overnightHigh?"ABOVE_OVERNIGHT_HIGH":"BELOW_OVERNIGHT_HIGH"):(trigger.close<=overnightLow?"BELOW_OVERNIGHT_LOW":"ABOVE_OVERNIGHT_LOW");
 features.set(date,{overnightDirection,openingWidth,breakoutLocation,openingPoints,overnightPoints});
 eligible.push(...day);
}
const friction={roundTripCommissionUsd:6,slippageTicksPerSide:1};
for(const [stopPoints,targetPoints] of [[25,25],[40,40]] as const){
 const trades=backtestNaiveOrb(eligible,{openingRangeMinutes:5,stopPoints,targetPoints,contracts:1,friction});
 const groups=new Map<string,{count:number;wins:number;netUsd:number}>();
 for(const trade of trades){
  const f=features.get(trade.date);if(!f)throw Error("Missing feature");
  console.log("DAY "+JSON.stringify({date:trade.date,stopPoints,targetPoints,direction:trade.direction,overnightDirection:f.overnightDirection,openingWidth:f.openingWidth,breakoutLocation:f.breakoutLocation,openingPoints:f.openingPoints,overnightPoints:f.overnightPoints,outcome:trade.exitReason,netUsd:trade.netPnlUsd}));
  for(const [dimension,label] of [["overnightDirection",f.overnightDirection],["openingWidth",f.openingWidth],["breakoutLocation",f.breakoutLocation]] as const){
   const key=dimension+"="+label;const g=groups.get(key)??{count:0,wins:0,netUsd:0};g.count++;g.wins+=Number(trade.netPnlUsd>0);g.netUsd+=trade.netPnlUsd;groups.set(key,g);
  }
 }
 for(const [pattern,g] of groups)console.log("PATTERN "+JSON.stringify({stopPoints,targetPoints,pattern,...g,winRate:g.wins/g.count,warning:"In-sample exploratory association only; small groups are not signals"}));
 console.log("SETUP_SUMMARY "+JSON.stringify({stopPoints,targetPoints,trades:trades.length,eligibleDates:features.size}));
}
console.log("TM001 PATTERN RECOGNITION V1: COMPLETE (NO STRATEGY APPROVAL)");

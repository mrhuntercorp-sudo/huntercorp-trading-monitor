import { CachedHistoricalDays } from "../research/historical-cache.js";
import { auditRthCoverage } from "../research/rth-coverage.js";
import { overnightBars } from "../research/session-features.js";
import { backtestNaiveOrb } from "../research/backtest.js";
import { newYorkClock } from "../market/time.js";
import type { FuturesContract,MinuteBar } from "../market/types.js";
const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("CACHE ONLY: API forbidden");}});
const contract:FuturesContract={ticker:"NQZ6",productCode:"NQ"};
const dates=["2026-09-21","2026-09-22","2026-09-23","2026-09-24","2026-09-25","2026-09-28","2026-09-29","2026-09-30","2026-10-01","2026-10-02"];
const fetchDates=["2026-09-20",...dates.slice(0,5),"2026-09-27",...dates.slice(5)];
const combos=[[20,40],[20,80],[30,60],[40,40],[40,80],[40,120],[60,80],[60,120]] as const;
const all:MinuteBar[]=[];
console.log("=== TM001 EOD TRAILING MLL ACCOUNT SURVIVAL ===");
console.log("CACHE ONLY | ONE NQ | $2K AND $3K | EOD TRAIL, LIVE ENFORCEMENT | NO POLICY APPROVAL");
for(const date of fetchDates)all.push(...await cache.getDay(contract,date));
all.sort((a,b)=>a.timestampMs-b.timestampMs);
if(new Set(all.map(b=>b.timestampMs)).size!==all.length)throw Error("Duplicate bars");
const rth=(date:string)=>all.filter(b=>{const c=newYorkClock(b.timestampMs),m=c.hour*60+c.minute;return c.date===date&&m>=570&&m<960;});
const valid:string[]=[];
for(const date of dates){const bars=rth(date),cov=auditRthCoverage(bars,date,contract.ticker),on=overnightBars(all,date);const complete=on.length===930&&new Set(on.map(b=>b.timestampMs)).size===930&&on.every((b,i)=>i===0||b.timestampMs-on[i-1]!.timestampMs===60000);if(cov.status==="COMPLETE"&&complete)valid.push(date);else console.log("QUARANTINE "+date);}
const eligible=all.filter(b=>valid.includes(newYorkClock(b.timestampMs).date)&&(()=>{const c=newYorkClock(b.timestampMs),m=c.hour*60+c.minute;return m>=570&&m<960;})());
const friction={roundTripCommissionUsd:6,slippageTicksPerSide:1};
for(const window of [5,15] as const){
 const reference=backtestNaiveOrb(eligible,{openingRangeMinutes:window,stopPoints:40,targetPoints:80,contracts:1,friction});
 const keys=reference.map(t=>t.date+"|"+t.direction+"|"+t.entry).join(",");
 for(const [stopPoints,targetPoints] of combos){
  const trades=backtestNaiveOrb(eligible,{openingRangeMinutes:window,stopPoints,targetPoints,contracts:1,friction});
  if(trades.map(t=>t.date+"|"+t.direction+"|"+t.entry).join(",")!==keys)throw Error("ENTRY DRIFT");
  for(const limit of [2000,3000]){
   let balance=0,highestEod=0,floor=-limit,breached=false,breachDate:string|null=null,minHeadroom=limit,daysCompleted=0;
   for(const trade of trades){
    if(breached)break;
    const day=rth(trade.date),minutes=window;
    const opening=day.slice(0,minutes),high=Math.max(...opening.map(b=>b.high)),low=Math.min(...opening.map(b=>b.low));
    const triggerIndex=day.findIndex((b,i)=>i>=minutes&&(b.close>high||b.close<low));
    if(triggerIndex<0||day[triggerIndex]!.close!==trade.entry)throw Error("TRIGGER MISMATCH "+trade.date);
    const entry=trade.entry,sign=trade.direction==="LONG"?1:-1;
    const stop=entry-sign*stopPoints,target=entry+sign*targetPoints;
    let exitReached=false;
    for(const bar of day.slice(triggerIndex+1)){
     const adverse=sign===1?bar.low:bar.high;
     const unrealized=(adverse-entry)*sign*20-16;
     const thresholdEquity=balance+unrealized;
     minHeadroom=Math.min(minHeadroom,thresholdEquity-floor);
     if(thresholdEquity<=floor){breached=true;breachDate=trade.date;break;}
     const stopHit=sign===1?bar.low<=stop:bar.high>=stop;
     const targetHit=sign===1?bar.high>=target:bar.low<=target;
     if(stopHit||targetHit){exitReached=true;break;}
    }
    if(breached)break;
    if(!exitReached&&trade.exitReason!=="SESSION_END")throw Error("EXIT NOT RECONCILED "+trade.date);
    balance+=trade.netPnlUsd;
    if(balance<=floor){breached=true;breachDate=trade.date;break;}
    highestEod=Math.max(highestEod,balance);
    floor=Math.max(floor,highestEod-limit,-0);
    daysCompleted++;
   }
   console.log("EOD_MLL "+JSON.stringify({openingRangeMinutes:window,stopPoints,targetPoints,limitUsd:limit,eligibleDates:valid.length,daysCompleted,breached,breachDate,endingBalanceUsd:balance,activeFloorUsd:floor,minEstimatedHeadroomUsd:minHeadroom,method:"EOD threshold update after each trade date; monitored on adverse one-minute OHLC; no payouts or optional DLL",status:"EXPLORATORY_ONLY"}));
  }
 }
}
console.log("TM001 EOD MLL SURVIVAL: COMPLETE (NO STRATEGY APPROVAL)");

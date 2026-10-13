/** Exploratory comparison only: the October 5-9 holdout has already been viewed. */
import {CachedHistoricalDays} from "../research/historical-cache.js";
import {auditRthCoverage} from "../research/rth-coverage.js";
import {backtestNaiveOrb} from "../research/backtest.js";
import {newYorkClock} from "../market/time.js";
import type {MinuteBar} from "../market/types.js";

const dates=["2026-10-05","2026-10-06","2026-10-07","2026-10-08","2026-10-09"];
const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("NETWORK_DISABLED");}});
const contract={ticker:"NQZ6",productCode:"NQ" as const};
const all:MinuteBar[]=[];
for(const date of ["2026-10-04",...dates])all.push(...await cache.getDay(contract,date));
all.sort((a,b)=>a.timestampMs-b.timestampMs);
const rth:MinuteBar[]=[];
const dayMap=new Map<string,MinuteBar[]>();
for(const date of dates){
 const day=all.filter(b=>{const c=newYorkClock(b.timestampMs),m=c.hour*60+c.minute;return c.date===date&&m>=570&&m<960;});
 const coverage=auditRthCoverage(day,date,contract.ticker);
 if(coverage.status!=="COMPLETE")throw Error("OOS1_COVERAGE_FAILED "+date);
 dayMap.set(date,day);rth.push(...day);
}
console.log("=== TM001 OOS1 15-MINUTE ORB EXPLORATORY CONTROL ===");
console.log("EXPLORATORY_ONLY | ALREADY_VIEWED_HOLDOUT | CACHE_ONLY | ZERO_API | ZERO_TRADES");
console.log("PREEXISTING_ORB_RULES",JSON.stringify({openingRangeMinutes:15,trigger:"first one-minute close beyond opening range",entry:"trigger close (optimistic: no next-bar entry delay)",stopPoints:40,targetPoints:80,position:"1_NQ",commissionRoundTripUsd:6,slippageTicksPerSide:1,maxTradesPerDay:1,stopTargetSameBar:"STOP_FIRST",riskModel:"no EOD MLL or operating stop; cannot certify Topstep account",alertTiming:"post-close signal is NOT advance notice"}));
const trades=backtestNaiveOrb(rth,{openingRangeMinutes:15,stopPoints:40,targetPoints:80,contracts:1,friction:{roundTripCommissionUsd:6,slippageTicksPerSide:1}});
let net=0,wins=0,losses=0;
for(const date of dates){
 const day=dayMap.get(date)!;
 const opening=day.slice(0,15),high=Math.max(...opening.map(b=>b.high)),low=Math.min(...opening.map(b=>b.low));
 const first=day.slice(15).find(b=>b.close>high||b.close<low);
 const t=trades.find(x=>x.date===date);
 if(t){net+=t.netPnlUsd;if(t.netPnlUsd>0)wins++;else losses++;}
 const clock=first?newYorkClock(first.timestampMs):null;
 const prior=first?day.filter(b=>b.timestampMs<first.timestampMs).at(-1):null;
 console.log("ORB_DAY",JSON.stringify({date,openingHigh:high,openingLow:low,openingWidthPoints:Math.round((high-low)*100)/100,triggerTimeEt:clock?`${String(clock.hour).padStart(2,"0")}:${String(clock.minute).padStart(2,"0")}`:null,priorBarClose:prior?.close??null,priorBarDistanceToTriggeredBoundaryPoints:prior&&t?Math.round((t.direction==="LONG"?high-prior.close:prior.close-low)*100)/100:null,direction:t?.direction??null,entry:t?.entry??null,exit:t?.exit??null,exitReason:t?.exitReason??null,netPnlUsd:t?.netPnlUsd??null}));
}
console.log("ORB_EXPLORATORY_SUMMARY",JSON.stringify({sessions:dates.length,trades:trades.length,wins,losses,netUsd:Math.round(net*100)/100,position:"1_NQ",comparableToTrend5MnqPnl:false,validatedOutOfSample:false,advanceAlertTested:false,liveTradingApproved:false}));

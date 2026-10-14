/** TM001 native-rule opening-window audit; no strategy selection or orders. */
import {CachedHistoricalDays} from "../research/historical-cache.js";
import {auditRthCoverage} from "../research/rth-coverage.js";
import {overnightBars} from "../research/session-features.js";
import {rthBars,knownLevels} from "../research/level-reclaim.js";
import {firstWickRejection} from "../research/wick-rejection.js";
import {marketContextAt} from "../research/market-context.js";
import {generateP4Signals} from "../research/p4-nq-signals.js";
import {simulateFixedShort} from "../research/fixed-short-feasibility.js";
import {backtestConservativeOrb} from "../research/conservative-orb.js";
import {newYorkClock} from "../market/time.js";
import {provisionalClosedDates,provisionalNqContract,isProvisionalRoll} from "./massive-nq-calendar-policy.js";
import type {MinuteBar} from "../market/types.js";
const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("NETWORK_DISABLED");}});
const ms=(s:string)=>Date.parse(s+"T00:00:00Z"),iso=(t:number)=>new Date(t).toISOString().slice(0,10);
const dates:string[]=[];for(let t=ms("2026-10-02");dates.length<30;t-=86400000){const d=iso(t),w=new Date(t).getUTCDay();if(w!==0&&w!==6&&!provisionalClosedDates.has(d))dates.push(d);}dates.reverse();
const loaded=new Map<string,Awaited<ReturnType<typeof cache.getDay>>>();
async function load(ticker:string,date:string){const k=ticker+"|"+date;if(!loaded.has(k))loaded.set(k,await cache.getDay({ticker,productCode:"NQ"},date));return loaded.get(k)!;}
type Trade={date:string;entryMinutes:number;net:number;reason:string;exitMinutes:number|null;ambiguous:boolean};
const ids=["ORB5_NATIVE_40_80","TREND_NATIVE_10_40","WICK_NATIVE_FIRST_DAILY","WICK_LOCKED_NONOVERLAP"] as const;
const trades=new Map<string,Trade[]>(ids.map(x=>[x,[]]));
const clock=(b:MinuteBar)=>{const c=newYorkClock(b.timestampMs);return c.hour*60+c.minute;};
const round=(n:number)=>Math.round(n*100)/100;
let eligible=0,excluded=0,orbNonOpening=0,trendNonOpening=0,wickCandidates=0,wickCollapsed=0,wickOverlap=0,wickLate=0,orbAmbiguous=0,trendAmbiguous=0;
console.log("=== TM001 NATIVE STRATEGY NY OPEN AUDIT ===");
console.log("IN_SAMPLE | CACHE_ONLY | ZERO_API | ZERO_ORDERS | NO_OPTIMIZATION");
console.log("NATIVE_RULES",JSON.stringify({entryWindowEt:"09:30-11:00",orb:"CONSERVATIVE_ORB5_NEXT_BAR_40_STOP_80_TARGET_SESSION_END",orbFriction:"2_POINTS_ASSUMED_TOTAL",trend:"P4_FROZEN_10_STOP_40_TARGET_30_MINUTE_DEADLINE",wick:"40_STOP_40_TARGET_10_BARS",wickVariants:["FIRST_OPENING_SIGNAL_PER_DAY","LOCKED_ALL_RTH_NONOVERLAP_THEN_OPENING_ENTRIES"],baseCostPoints:2,costSensitivityExtraPoints:[0,1,2,4],nonIdenticalRiskContracts:true,notComparableRiskAdjustedReturns:true}));
for(const date of dates){
 const ticker=provisionalNqContract(date),prior=iso(ms(date)-86400000);
 const bars=[...await load(ticker,prior),...await load(ticker,date)].sort((a,b)=>a.timestampMs-b.timestampMs);
 const day=rthBars(bars,date),overnight=overnightBars(bars,date);
 if(isProvisionalRoll(date)||auditRthCoverage(day,date,ticker).status!=="COMPLETE"||overnight.length!==930||overnight.some((b,i)=>i>0&&b.timestampMs-overnight[i-1]!.timestampMs!==60000)||new Set(bars.map(b=>b.timestampMs)).size!==bars.length){excluded++;continue;}
 eligible++;
 const orb=backtestConservativeOrb(day,{openingRangeMinutes:5,stopPoints:40,targetPoints:80,contracts:1,friction:{roundTripCommissionUsd:40,slippageTicksPerSide:0}});
 if(orb.excluded.length)throw Error("ORB_NATIVE_EXCLUDED "+JSON.stringify(orb.excluded));
 for(const t of orb.trades){const entryMinutes=clock({timestampMs:t.entryTimestampMs} as MinuteBar);if(entryMinutes>=660){orbNonOpening++;continue;}if(t.ambiguousExit)orbAmbiguous++;trades.get(ids[0])!.push({date,entryMinutes,net:t.netPnlUsd/20,reason:t.exitReason,exitMinutes:null,ambiguous:t.ambiguousExit});}
 const trend=generateP4Signals({bars:day,contractVerified:true,calendarVerified:true},"SESSION_TREND_PULLBACK_V1",10);
 for(const s of trend){const entryIndex=day.findIndex(b=>b.timestampMs===s.entryTime);if(entryIndex<0)throw Error("TREND_ENTRY_MISSING");const entryMinutes=clock(day[entryIndex]!);if(entryMinutes>=660){trendNonOpening++;continue;}
  const sign=s.direction==="LONG"?1:-1;let exit=s.entryPrice,reason="TIME",exitIndex=entryIndex,ambiguous=false;
  const deadline=Math.min(s.timeExitMs,day.at(-1)!.timestampMs);
  for(let j=entryIndex;j<day.length;j++){
   const b=day[j]!;
   if(b.timestampMs>=deadline){exit=b.open;exitIndex=j;break;}
   if(j===day.length-1){exit=b.close;exitIndex=j;break;}
   const stopHit=sign===1?b.low<=s.stopPrice:b.high>=s.stopPrice,targetHit=sign===1?b.high>=s.targetPrice:b.low<=s.targetPrice;
   if(stopHit){ambiguous=targetHit;exit=sign===1?Math.min(s.stopPrice,b.open):Math.max(s.stopPrice,b.open);reason="STOP";exitIndex=j;break;}
   if(targetHit){exit=s.targetPrice;reason="TARGET";exitIndex=j;break;}
  }
  if(ambiguous)trendAmbiguous++;
  trades.get(ids[1])!.push({date,entryMinutes,net:(exit-s.entryPrice)*sign-2,reason,exitMinutes:clock(day[exitIndex]!),ambiguous});
 }
 const levels=knownLevels(day,overnight),events=new Set<number>();
 for(const level of levels){const e=firstWickRejection(day,level);if(!e||e.direction!=="SHORT")continue;const net=marketContextAt(day,levels,e.barIndex).trailingFiveNetPoints;if(net===null||net<=0)continue;wickCandidates++;if(events.has(e.barIndex)){wickCollapsed++;continue;}events.add(e.barIndex);}
 const sorted=[...events].sort((a,b)=>a-b);
 const first=sorted.find(i=>i+1<day.length&&clock(day[i+1]!)<660);
 if(first!==undefined){const sim=simulateFixedShort(day,first);if(sim)trades.get(ids[2])!.push({date,entryMinutes:clock(day[sim.entryIndex]!),net:sim.netPoints,reason:sim.reason,exitMinutes:clock(day[sim.exitIndex]!),ambiguous:sim.ambiguousBar});}
 let busy=-1;
 for(const i of sorted){if(i<=busy){wickOverlap++;continue;}const sim=simulateFixedShort(day,i);if(!sim){wickLate++;continue;}busy=sim.exitIndex;const entryMinutes=clock(day[sim.entryIndex]!);if(entryMinutes>=660)continue;trades.get(ids[3])!.push({date,entryMinutes,net:sim.netPoints,reason:sim.reason,exitMinutes:clock(day[sim.exitIndex]!),ambiguous:sim.ambiguousBar});}
}
for(const id of ids){
 const a=trades.get(id)!,net=a.reduce((s,t)=>s+t.net,0),daily=a.map(t=>t.date).filter((d,i,arr)=>arr.indexOf(d)===i).map(d=>a.filter(t=>t.date===d).reduce((s,t)=>s+t.net,0));
 let equity=0,peak=0,dd=0;for(const t of a){equity+=t.net;peak=Math.max(peak,equity);dd=Math.max(dd,peak-equity);}
 console.log("NATIVE_STRATEGY_RESULT",JSON.stringify({strategy:id,trades:a.length,sessions:daily.length,wins:a.filter(t=>t.net>0).length,losses:a.filter(t=>t.net<0).length,stops:a.filter(t=>t.reason==="STOP").length,targets:a.filter(t=>t.reason==="TARGET").length,timeExits:a.filter(t=>t.reason==="TIME"||t.reason==="SESSION_END").length,netPoints:round(net),avgNetPoints:a.length?round(net/a.length):null,worstSessionPoints:daily.length?round(Math.min(...daily)):null,maxClosedTradeDrawdownPoints:round(dd),netWithoutBestSessionPoints:daily.length?round(net-Math.max(...daily)):null,ambiguousStopTargetBars:a.filter(t=>t.ambiguous).length,knownExitsAtOrAfter11:a.filter(t=>t.exitMinutes!==null&&t.exitMinutes>=660).length,unknownExitTimes:a.filter(t=>t.exitMinutes===null).length,costStress:[0,1,2,4].map(extra=>({extraPointsPerTrade:extra,netPoints:round(net-extra*a.length)})),researchOnly:true}));
}
console.log("NATIVE_AUDIT_COMPLETE",JSON.stringify({eligible,excluded,orbNonOpening,trendNonOpening,wickCandidates,wickCollapsed,wickOverlap,wickLate,orbAmbiguous,trendAmbiguous,priorOosRejectionsRemain:true,notFreshOutOfSample:true,noStrategyApproved:true,noOrders:true}));

/** Strategy-family comparison at 09:30-11:00 ET. Common research proxy, not native P4/ORB replay. */
import {CachedHistoricalDays} from "../research/historical-cache.js";
import {auditRthCoverage} from "../research/rth-coverage.js";
import {overnightBars} from "../research/session-features.js";
import {rthBars,knownLevels} from "../research/level-reclaim.js";
import {firstWickRejection} from "../research/wick-rejection.js";
import {marketContextAt} from "../research/market-context.js";
import {overnightSweepReclaims,openingRangeBreakoutRetest,type P3Signal} from "../research/p3-nq-signals.js";
import {generateP4Signals,type P4Strategy} from "../research/p4-nq-signals.js";
import {simulateFixedShort} from "../research/fixed-short-feasibility.js";
import {newYorkClock} from "../market/time.js";
import {provisionalClosedDates,provisionalNqContract,isProvisionalRoll} from "./massive-nq-calendar-policy.js";
import type {MinuteBar} from "../market/types.js";
const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("NETWORK_DISABLED");}});
const ms=(s:string)=>Date.parse(s+"T00:00:00Z"),iso=(t:number)=>new Date(t).toISOString().slice(0,10);
const dates:string[]=[];for(let t=ms("2026-10-02");dates.length<30;t-=86400000){const d=iso(t),w=new Date(t).getUTCDay();if(w!==0&&w!==6&&!provisionalClosedDates.has(d))dates.push(d);}dates.reverse();
const loaded=new Map<string,Awaited<ReturnType<typeof cache.getDay>>>();
async function load(ticker:string,date:string){const k=ticker+"|"+date;if(!loaded.has(k))loaded.set(k,await cache.getDay({ticker,productCode:"NQ"},date));return loaded.get(k)!;}
const p4:P4Strategy[]=["SESSION_TREND_PULLBACK_V1","VOLATILITY_COMPRESSION_EXPANSION_V1","OPENING_DRIVE_FAILURE_V1","LOW_TREND_MEAN_REVERSION_V1"];
const ids=["ORB5_FIRST_BREAK","ORB15_FIRST_BREAK","ON_SWEEP_RECLAIM_V1","ORB_RETEST_V1",...p4,"COUNTERTREND_WICK_SHORT"] as const;
type Direction="LONG"|"SHORT";
type Candidate={index:number;direction:Direction};
type Trade={date:string;net:number;reason:"STOP"|"TARGET"|"TIME";exitIndex:number;entryIndex:number};
const all=new Map<string,Trade[]>(ids.map(id=>[id,[]]));
const counts=new Map<string,{allSignals:number;openingSignals:number;skippedLate:number;skippedOverlap:number}>(ids.map(id=>[id,{allSignals:0,openingSignals:0,skippedLate:0,skippedOverlap:0}]));
const clock=(b:MinuteBar)=>{const c=newYorkClock(b.timestampMs);return c.hour*60+c.minute;};
const round=(n:number)=>Math.round(n*100)/100;
function simulate(day:readonly MinuteBar[],index:number,direction:Direction):Trade|null{
 if(index<0||index+10>=day.length)return null;
 const entryIndex=index+1,entry=day[entryIndex]!.open,sign=direction==="LONG"?1:-1;
 const stop=entry-sign*40,target=entry+sign*40;
 for(let j=entryIndex;j<entryIndex+10;j++){
  const b=day[j]!;
  if(b.high<b.low||b.high<Math.max(b.open,b.close)||b.low>Math.min(b.open,b.close))throw Error("INVALID_BAR");
  if(j>entryIndex&&((sign===1&&b.open<=stop)||(sign===-1&&b.open>=stop)))return {date:"",net:(b.open-entry)*sign-2,reason:"STOP",exitIndex:j,entryIndex};
  if(j>entryIndex&&((sign===1&&b.open>=target)||(sign===-1&&b.open<=target)))return {date:"",net:38,reason:"TARGET",exitIndex:j,entryIndex};
  const hitStop=sign===1?b.low<=stop:b.high>=stop,hitTarget=sign===1?b.high>=target:b.low<=target;
  if(hitStop)return {date:"",net:-42,reason:"STOP",exitIndex:j,entryIndex};
  if(hitTarget)return {date:"",net:38,reason:"TARGET",exitIndex:j,entryIndex};
 }
 const exitIndex=entryIndex+9;
 return {date:"",net:(day[exitIndex]!.close-entry)*sign-2,reason:"TIME",exitIndex,entryIndex};
}
let eligible=0,excluded=0,baselineParityFailures=0;
console.log("=== TM001 MULTI-STRATEGY NY OPEN COMPARISON ===");
console.log("IN_SAMPLE | CACHE_ONLY | ZERO_API | ZERO_ORDERS | RESEARCH_PROXY_NOT_NATIVE_STRATEGY_PNL");
console.log("COMPARISON_RULES",JSON.stringify({entryWindowEt:"09:30-11:00",entryClassification:"NEXT_BAR_OPEN",allSignalsGeneratedFromCompleteRthButCausalFunctionsOnly,commonExit:"40pt_STOP_40pt_TARGET_10_BARS_2pt_COST",selection:"FIRST_ELIGIBLE_SIGNAL_PER_STRATEGY_PER_DAY",p4OriginalStopsAnd30MinuteExitsReplacedForComparison:true,orbOriginalTargetsAndSessionExitsReplacedForComparison:true,notFrozenOriginalStrategyBacktests:true}));
for(const date of dates){
 const ticker=provisionalNqContract(date),prior=iso(ms(date)-86400000);
 const bars=[...await load(ticker,prior),...await load(ticker,date)].sort((a,b)=>a.timestampMs-b.timestampMs);
 const day=rthBars(bars,date),overnight=overnightBars(bars,date);
 if(isProvisionalRoll(date)||auditRthCoverage(day,date,ticker).status!=="COMPLETE"||overnight.length!==930||overnight.some((b,i)=>i>0&&b.timestampMs-overnight[i-1]!.timestampMs!==60000)||new Set(bars.map(b=>b.timestampMs)).size!==bars.length){excluded++;continue;}
 eligible++;
 const signals=new Map<string,Candidate[]>(ids.map(id=>[id,[]]));
 for(const minutes of [5,15] as const){
  const hi=Math.max(...day.slice(0,minutes).map(b=>b.high)),lo=Math.min(...day.slice(0,minutes).map(b=>b.low));
  const i=day.findIndex((b,k)=>k>=minutes&&k+1<day.length&&(b.close>hi||b.close<lo));
  if(i>=0)signals.get(minutes===5?"ORB5_FIRST_BREAK":"ORB15_FIRST_BREAK")!.push({index:i,direction:day[i]!.close>hi?"LONG":"SHORT"});
 }
 const high=Math.max(...overnight.map(b=>b.high)),low=Math.min(...overnight.map(b=>b.low));
 const p3s:P3Signal[]=[...overnightSweepReclaims(day,high,low),...openingRangeBreakoutRetest(day)];
 for(const s of p3s){const index=day.findIndex(b=>b.timestampMs===s.signalTime);if(index>=0)signals.get(s.strategy)!.push({index,direction:s.direction});}
 for(const strategy of p4){for(const s of generateP4Signals({bars:day,contractVerified:true,calendarVerified:true},strategy,10)){const index=day.findIndex(b=>b.timestampMs===s.signalTime);if(index>=0)signals.get(strategy)!.push({index,direction:s.direction});}}
 const levels=knownLevels(day,overnight),wick=new Set<number>();
 for(const level of levels){const e=firstWickRejection(day,level);if(!e||e.direction!=="SHORT"||wick.has(e.barIndex))continue;const net=marketContextAt(day,levels,e.barIndex).trailingFiveNetPoints;if(net===null||net<=0)continue;wick.add(e.barIndex);signals.get("COUNTERTREND_WICK_SHORT")!.push({index:e.barIndex,direction:"SHORT"});}
 for(const id of ids){
  const candidates=signals.get(id)!.sort((a,b)=>a.index-b.index),c=counts.get(id)!;
  c.allSignals+=candidates.length;
  const opening=candidates.filter(s=>s.index+1<day.length&&clock(day[s.index+1]!)>=570&&clock(day[s.index+1]!)<660);
  c.openingSignals+=opening.length;
  const chosen=opening[0];if(!chosen)continue;
  const sim=simulate(day,chosen.index,chosen.direction);if(!sim){c.skippedLate++;continue;}
  sim.date=date;all.get(id)!.push(sim);
  if(id==="COUNTERTREND_WICK_SHORT"){
   const reference=simulateFixedShort(day,chosen.index);
   if(!reference||reference.exitIndex!==sim.exitIndex||Math.abs(reference.netPoints-sim.net)>1e-9)baselineParityFailures++;
  }
  if(opening.length>1)c.skippedOverlap+=opening.length-1;
 }
}
if(baselineParityFailures)throw Error("WICK_BASELINE_PARITY_FAILED "+baselineParityFailures);
for(const id of ids){
 const trades=all.get(id)!,c=counts.get(id)!,sum=trades.reduce((s,t)=>s+t.net,0);
 const sessions=[...new Set(trades.map(t=>t.date))],daily=sessions.map(date=>trades.filter(t=>t.date===date).reduce((s,t)=>s+t.net,0));
 let equity=0,peak=0,drawdown=0;
 for(const t of trades){equity+=t.net;peak=Math.max(peak,equity);drawdown=Math.max(drawdown,peak-equity);}
 const removeBest=daily.length?sum-Math.max(...daily):null;
 console.log("STRATEGY_WINDOW_RESULT",JSON.stringify({strategy:id,eligibleSessions:eligible,allSignals:c.allSignals,openingSignals:c.openingSignals,trades:trades.length,distinctTradeSessions:sessions.length,wins:trades.filter(t=>t.net>0).length,losses:trades.filter(t=>t.net<0).length,stops:trades.filter(t=>t.reason==="STOP").length,targets:trades.filter(t=>t.reason==="TARGET").length,timeExits:trades.filter(t=>t.reason==="TIME").length,netPoints:round(sum),avgPointsPerTrade:trades.length?round(sum/trades.length):null,positiveSessions:daily.filter(x=>x>0).length,negativeSessions:daily.filter(x=>x<0).length,worstSessionPoints:daily.length?round(Math.min(...daily)):null,maxClosedTradeDrawdownPoints:round(drawdown),netWithoutBestSessionPoints:removeBest===null?null:round(removeBest),skippedAdditionalSignals:c.skippedOverlap,commonProxyNotNativePnl:true}));
}
console.log("STRATEGY_COMPARISON_COMPLETE",JSON.stringify({eligible,excluded,baselineParityFailures,allFamiliesIncluded:ids.length,firstSignalPerDayPerStrategy:true,openingOnly:true,commonExitProxy:true,originalNativeStrategyRulesNotPreserved:true,previousOosRejectionsRemain:true,noWinnerApproval:true,noLiveOrders:true}));

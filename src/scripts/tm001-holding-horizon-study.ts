/** Fixed-parameter holding-time sensitivity; two predeclared stages, no selection. */
import {CachedHistoricalDays} from "../research/historical-cache.js";
import {auditRthCoverage} from "../research/rth-coverage.js";
import {overnightBars} from "../research/session-features.js";
import {knownLevels,rthBars} from "../research/level-reclaim.js";
import {firstWickRejection} from "../research/wick-rejection.js";
import {marketContextAt} from "../research/market-context.js";
import {FIXED_SHORT_RULES,simulateFixedShort} from "../research/fixed-short-feasibility.js";
import {provisionalClosedDates,provisionalNqContract,isProvisionalRoll} from "./massive-nq-calendar-policy.js";
import type {MinuteBar} from "../market/types.js";
const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("NETWORK_DISABLED");}});
const ms=(s:string)=>Date.parse(s+"T00:00:00Z"),iso=(t:number)=>new Date(t).toISOString().slice(0,10);
const dates:string[]=[];for(let t=ms("2026-10-02");dates.length<30;t-=86400000){const d=iso(t),w=new Date(t).getUTCDay();if(w!==0&&w!==6&&!provisionalClosedDates.has(d))dates.push(d);}dates.reverse();
const loaded=new Map<string,Awaited<ReturnType<typeof cache.getDay>>>();
async function load(ticker:string,date:string){const k=ticker+"|"+date;if(!loaded.has(k))loaded.set(k,await cache.getDay({ticker,productCode:"NQ"},date));return loaded.get(k)!;}
type Outcome={date:string;net:number;reason:"STOP"|"TARGET"|"TIME";exitIndex:number;barsHeld:number;ambiguous:boolean};
const round=(n:number)=>Math.round(n*100)/100;
function simulate(day:readonly MinuteBar[],index:number,maxBars:number):Outcome|null{
 if(index<0||index+maxBars>=day.length)return null;
 const entryIndex=index+1,entry=day[entryIndex]!.open,stop=entry+FIXED_SHORT_RULES.stopPoints,target=entry-FIXED_SHORT_RULES.targetPoints;
 for(let i=entryIndex;i<entryIndex+maxBars;i++){
  const b=day[i]!;
  if(b.high<b.low||b.high<Math.max(b.open,b.close)||b.low>Math.min(b.open,b.close))throw Error("INVALID_BAR");
  if(i>entryIndex&&b.open>=stop)return {date:"",net:entry-b.open-FIXED_SHORT_RULES.roundTripCostPoints,reason:"STOP",exitIndex:i,barsHeld:i-entryIndex+1,ambiguous:false};
  if(i>entryIndex&&b.open<=target)return {date:"",net:entry-target-FIXED_SHORT_RULES.roundTripCostPoints,reason:"TARGET",exitIndex:i,barsHeld:i-entryIndex+1,ambiguous:false};
  if(b.high>=stop)return {date:"",net:-FIXED_SHORT_RULES.stopPoints-FIXED_SHORT_RULES.roundTripCostPoints,reason:"STOP",exitIndex:i,barsHeld:i-entryIndex+1,ambiguous:b.low<=target};
  if(b.low<=target)return {date:"",net:FIXED_SHORT_RULES.targetPoints-FIXED_SHORT_RULES.roundTripCostPoints,reason:"TARGET",exitIndex:i,barsHeld:i-entryIndex+1,ambiguous:false};
 }
 const exitIndex=entryIndex+maxBars-1;
 return {date:"",net:entry-day[exitIndex]!.close-FIXED_SHORT_RULES.roundTripCostPoints,reason:"TIME",exitIndex,barsHeld:maxBars,ambiguous:false};
}
const horizons=[3,5,10,15,30,60] as const;
const records=new Map<number,Outcome[]>(horizons.map(h=>[h,[]]));
const skipped=new Map<number,{overlap:number;late:number}>(horizons.map(h=>[h,{overlap:0,late:0}]));
let eligible=0,excluded=0,rawCandidates=0,collapsed=0,baselineMismatch=0;
console.log("=== TM001 FIXED HOLDING HORIZON STUDY ===");
console.log("IN_SAMPLE | CACHE_ONLY | ZERO_API | ZERO_ORDERS | NO_OPTIMIZATION");
console.log("HORIZON_RULES",JSON.stringify({stage1:[3,5,10,15],stage2:[30,60],stopPoints:40,targetPoints:40,roundTripCostPoints:2,exitAtHorizonClose:true,stopFirstOnAmbiguousBar:true,onePositionAtATimePerHorizon:true}));
for(const date of dates){
 const ticker=provisionalNqContract(date),prior=iso(ms(date)-86400000);
 const bars=[...await load(ticker,prior),...await load(ticker,date)].sort((a,b)=>a.timestampMs-b.timestampMs);
 const day=rthBars(bars,date),overnight=overnightBars(bars,date);
 if(isProvisionalRoll(date)||auditRthCoverage(day,date,ticker).status!=="COMPLETE"||overnight.length!==930||overnight.some((b,i)=>i>0&&b.timestampMs-overnight[i-1]!.timestampMs!==60000)||new Set(bars.map(b=>b.timestampMs)).size!==bars.length){excluded++;continue;}
 eligible++;const levels=knownLevels(day,overnight),events=new Set<number>();
 for(const level of levels){
  const e=firstWickRejection(day,level);if(!e||e.direction!=="SHORT")continue;
  const net=marketContextAt(day,levels,e.barIndex).trailingFiveNetPoints;
  if(net===null||net<=0)continue;
  rawCandidates++;if(events.has(e.barIndex)){collapsed++;continue;}events.add(e.barIndex);
 }
 for(const horizon of horizons){
  let busyThrough=-1;
  for(const index of [...events].sort((a,b)=>a-b)){
   if(index<=busyThrough){skipped.get(horizon)!.overlap++;continue;}
   const outcome=simulate(day,index,horizon);
   if(!outcome){skipped.get(horizon)!.late++;continue;}
   if(horizon===10){
    const original=simulateFixedShort(day,index);
    if(!original||original.exitIndex!==outcome.exitIndex||original.reason!==outcome.reason||Math.abs(original.netPoints-outcome.net)>1e-9)baselineMismatch++;
   }
   busyThrough=outcome.exitIndex;outcome.date=date;records.get(horizon)!.push(outcome);
  }
 }
}
if(baselineMismatch)throw Error("BASELINE_10M_MISMATCH "+baselineMismatch);
for(const horizon of horizons){
 const trades=records.get(horizon)!,sum=trades.reduce((s,t)=>s+t.net,0);
 const sessions=[...new Set(trades.map(t=>t.date))];
 const bySession=sessions.map(date=>trades.filter(t=>t.date===date).reduce((s,t)=>s+t.net,0));
 let equity=0,peak=0,maxDrawdown=0,lossStreak=0,maxLossStreak=0;
 for(const t of trades){equity+=t.net;peak=Math.max(peak,equity);maxDrawdown=Math.max(maxDrawdown,peak-equity);lossStreak=t.net<0?lossStreak+1:0;maxLossStreak=Math.max(maxLossStreak,lossStreak);}
 console.log("HORIZON_RESULT",JSON.stringify({stage:horizon<=15?1:2,maxHoldMinutes:horizon,trades:trades.length,distinctSessions:sessions.length,wins:trades.filter(t=>t.net>0).length,losses:trades.filter(t=>t.net<0).length,stops:trades.filter(t=>t.reason==="STOP").length,targets:trades.filter(t=>t.reason==="TARGET").length,timeExits:trades.filter(t=>t.reason==="TIME").length,medianBarsHeld:(()=>{const a=trades.map(t=>t.barsHeld).sort((x,y)=>x-y);return a.length?(a[Math.floor((a.length-1)/2)]!+a[Math.floor(a.length/2)]!)/2:null;})(),totalNetPointsAfterAssumedCosts:round(sum),averageNetPointsPerTrade:trades.length?round(sum/trades.length):null,maxSequentialTradeDrawdownPoints:round(maxDrawdown),maxConsecutiveLosses:maxLossStreak,positiveSessions:bySession.filter(n=>n>0).length,negativeSessions:bySession.filter(n=>n<0).length,ambiguousStopFirst:trades.filter(t=>t.ambiguous).length,...skipped.get(horizon),notValidatedPnl:true}));
}
console.log("HORIZON_COMPLETE",JSON.stringify({eligible,excluded,rawCandidates,collapsedSameCandle:collapsed,baseline10mEngineParity:true,allHorizonsPredeclared:true,tradeSetsDifferDueToOverlapAndEndOfSession:true,noOptimizationOrWinnerSelection:true,notFreshOutOfSample:true,feesSlippageOnlyProxy:true,noLiveApproval:true}));

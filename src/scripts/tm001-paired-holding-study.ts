/** Same-entry paired holding horizons, selected by locked 10m baseline. Research only. */
import {CachedHistoricalDays} from "../research/historical-cache.js";
import {auditRthCoverage} from "../research/rth-coverage.js";
import {overnightBars} from "../research/session-features.js";
import {knownLevels,rthBars} from "../research/level-reclaim.js";
import {firstWickRejection} from "../research/wick-rejection.js";
import {marketContextAt} from "../research/market-context.js";
import {simulateFixedShort,FIXED_SHORT_RULES} from "../research/fixed-short-feasibility.js";
import {provisionalClosedDates,provisionalNqContract,isProvisionalRoll} from "./massive-nq-calendar-policy.js";
import type {MinuteBar} from "../market/types.js";
const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("NETWORK_DISABLED");}});
const ms=(s:string)=>Date.parse(s+"T00:00:00Z"),iso=(t:number)=>new Date(t).toISOString().slice(0,10);
const dates:string[]=[];for(let t=ms("2026-10-02");dates.length<30;t-=86400000){const d=iso(t),w=new Date(t).getUTCDay();if(w!==0&&w!==6&&!provisionalClosedDates.has(d))dates.push(d);}dates.reverse();
const loaded=new Map<string,Awaited<ReturnType<typeof cache.getDay>>>();
async function load(ticker:string,date:string){const k=ticker+"|"+date;if(!loaded.has(k))loaded.set(k,await cache.getDay({ticker,productCode:"NQ"},date));return loaded.get(k)!;}
const horizons=[3,5,10,15,30,60] as const;
type Result={reason:"STOP"|"TARGET"|"TIME";net:number;barsHeld:number;ambiguous:boolean};
function run(day:readonly MinuteBar[],index:number,maxBars:number):Result{
 if(index<0||index+maxBars>=day.length)throw Error("INSUFFICIENT_HORIZON");
 const entryIndex=index+1,entry=day[entryIndex]!.open,stop=entry+40,target=entry-40;
 for(let i=entryIndex;i<entryIndex+maxBars;i++){
  const b=day[i]!;
  if(b.high<b.low||b.high<Math.max(b.open,b.close)||b.low>Math.min(b.open,b.close))throw Error("INVALID_BAR");
  if(i>entryIndex&&b.open>=stop)return {reason:"STOP",net:entry-b.open-2,barsHeld:i-entryIndex+1,ambiguous:false};
  if(i>entryIndex&&b.open<=target)return {reason:"TARGET",net:entry-target-2,barsHeld:i-entryIndex+1,ambiguous:false};
  if(b.high>=stop)return {reason:"STOP",net:-42,barsHeld:i-entryIndex+1,ambiguous:b.low<=target};
  if(b.low<=target)return {reason:"TARGET",net:38,barsHeld:i-entryIndex+1,ambiguous:false};
 }
 return {reason:"TIME",net:entry-day[entryIndex+maxBars-1]!.close-2,barsHeld:maxBars,ambiguous:false};
}
type Pair={date:string;index:number;results:Map<number,Result>};
const pairs:Pair[]=[];let eligible=0,excluded=0,candidates=0,collapsed=0,baselineSelected=0,excluded60Coverage=0,baselineParityFailures=0,overlapping60Windows=0;
console.log("=== TM001 PAIRED HOLDING PERIOD STUDY ===");
console.log("IN_SAMPLE | CACHE_ONLY | ZERO_API | ZERO_TRADES | NO_OPTIMIZATION");
console.log("PAIRED_RULES",JSON.stringify({selection:"LOCKED_10M_NON_OVERLAP",commonFullCoverageMinutes:60,horizons,stopPoints:FIXED_SHORT_RULES.stopPoints,targetPoints:FIXED_SHORT_RULES.targetPoints,roundTripCostPoints:FIXED_SHORT_RULES.roundTripCostPoints,identicalEntrySignals:true,pairedNotPortfolio:true}));
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
  candidates++;if(events.has(e.barIndex)){collapsed++;continue;}events.add(e.barIndex);
 }
 let busyThrough=-1,last60End=-1;
 for(const index of [...events].sort((a,b)=>a-b)){
  if(index<=busyThrough)continue;
  const baseline=simulateFixedShort(day,index);if(!baseline)continue;
  busyThrough=baseline.exitIndex;baselineSelected++;
  if(index+60>=day.length){excluded60Coverage++;continue;}
  if(index<=last60End)overlapping60Windows++;
  last60End=index+60;
  const results=new Map<number,Result>();
  for(const horizon of horizons)results.set(horizon,run(day,index,horizon));
  const test=results.get(10)!;
  if(test.reason!==baseline.reason||Math.abs(test.net-baseline.netPoints)>1e-9||test.barsHeld!==baseline.exitIndex-index)baselineParityFailures++;
  pairs.push({date,index,results});
 }
}
if(baselineParityFailures)throw Error("PAIRED_BASELINE_PARITY_FAILED "+baselineParityFailures);
const round=(n:number)=>Math.round(n*100)/100;
for(const horizon of horizons){
 const results=pairs.map(p=>p.results.get(horizon)!),sum=results.reduce((s,r)=>s+r.net,0);
 const sessions=[...new Set(pairs.map(p=>p.date))];
 const sessionNet=sessions.map(d=>pairs.filter(p=>p.date===d).reduce((s,p)=>s+p.results.get(horizon)!.net,0));
 console.log("PAIRED_HORIZON",JSON.stringify({maxHoldMinutes:horizon,pairedSignals:pairs.length,distinctSessions:sessions.length,wins:results.filter(r=>r.net>0).length,losses:results.filter(r=>r.net<0).length,stops:results.filter(r=>r.reason==="STOP").length,targets:results.filter(r=>r.reason==="TARGET").length,timeExits:results.filter(r=>r.reason==="TIME").length,totalNetPointsAfterAssumedCosts:round(sum),averageNetPointsPerSignal:pairs.length?round(sum/pairs.length):null,positiveSessions:sessionNet.filter(n=>n>0).length,negativeSessions:sessionNet.filter(n=>n<0).length,ambiguousStopFirst:results.filter(r=>r.ambiguous).length,pairedResearchNotExecutablePortfolio:true}));
}
for(const horizon of horizons.filter(h=>h!==10)){
 const deltas=pairs.map(p=>p.results.get(horizon)!.net-p.results.get(10)!.net);
 console.log("PAIRED_VS_10M",JSON.stringify({maxHoldMinutes:horizon,signals:pairs.length,better:deltas.filter(n=>n>0).length,worse:deltas.filter(n=>n<0).length,unchanged:deltas.filter(n=>n===0).length,totalDeltaNetPoints:round(deltas.reduce((s,n)=>s+n,0)),notIndependentSignals:true}));
}
const firstTouch=pairs.map(p=>p.results.get(60)!);
for(const horizon of horizons){
 console.log("FIRST_TOUCH_BY",JSON.stringify({minutes:horizon,signals:pairs.length,stopOrTargetTouched: firstTouch.filter(r=>r.reason!=="TIME"&&r.barsHeld<=horizon).length,targets:firstTouch.filter(r=>r.reason==="TARGET"&&r.barsHeld<=horizon).length,stops:firstTouch.filter(r=>r.reason==="STOP"&&r.barsHeld<=horizon).length}));
}
console.log("PAIRED_COMPLETE",JSON.stringify({eligible,excluded,candidates,collapsedSameCandle:collapsed,baselineSelected,excluded60Coverage,pairedSignals:pairs.length,overlapping60Windows,baselineParityFailures,full60MinuteCoverageRequired:true,entrySelectionUses10mBaseline:true,horizonsMayOverlapOtherEntries:true,noIndependentPortfolioClaim:true,notFreshOutOfSample:true,noLiveApproval:true}));

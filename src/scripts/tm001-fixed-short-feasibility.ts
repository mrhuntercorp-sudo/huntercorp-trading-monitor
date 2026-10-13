/** In-sample fixed-rule countertrend SHORT feasibility. No parameter search. */
import {CachedHistoricalDays} from "../research/historical-cache.js";
import {auditRthCoverage} from "../research/rth-coverage.js";
import {overnightBars} from "../research/session-features.js";
import {knownLevels,rthBars} from "../research/level-reclaim.js";
import {firstWickRejection} from "../research/wick-rejection.js";
import {marketContextAt} from "../research/market-context.js";
import {simulateFixedShort,FIXED_SHORT_RULES} from "../research/fixed-short-feasibility.js";
import {provisionalClosedDates,provisionalNqContract,isProvisionalRoll} from "./massive-nq-calendar-policy.js";
const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("NETWORK_DISABLED");}});
const ms=(s:string)=>Date.parse(s+"T00:00:00Z"),iso=(t:number)=>new Date(t).toISOString().slice(0,10);
const dates:string[]=[];for(let t=ms("2026-10-02");dates.length<30;t-=86400000){const d=iso(t),w=new Date(t).getUTCDay();if(w!==0&&w!==6&&!provisionalClosedDates.has(d))dates.push(d);}dates.reverse();
const loaded=new Map<string,Awaited<ReturnType<typeof cache.getDay>>>();
async function load(ticker:string,date:string){const k=ticker+"|"+date;if(!loaded.has(k))loaded.set(k,await cache.getDay({ticker,productCode:"NQ"},date));return loaded.get(k)!;}
type Trade={date:string;netPoints:number;reason:string;ambiguous:boolean};
const trades:Trade[]=[];let eligible=0,excluded=0,candidates=0,skippedOverlap=0,skippedLate=0,collapsed=0;
console.log("=== TM001 FIXED COUNTERTREND SHORT FEASIBILITY ===");
console.log("IN_SAMPLE | CACHE_ONLY | ZERO_API | ZERO_ORDERS | FIXED_RULES | NOT_VALIDATED");
console.log("FIXED_RULES",JSON.stringify(FIXED_SHORT_RULES));
for(const date of dates){
 const ticker=provisionalNqContract(date),prior=iso(ms(date)-86400000);
 const bars=[...await load(ticker,prior),...await load(ticker,date)].sort((a,b)=>a.timestampMs-b.timestampMs);
 const day=rthBars(bars,date),overnight=overnightBars(bars,date);
 if(isProvisionalRoll(date)||auditRthCoverage(day,date,ticker).status!=="COMPLETE"||overnight.length!==930||overnight.some((b,i)=>i>0&&b.timestampMs-overnight[i-1]!.timestampMs!==60000)||new Set(bars.map(b=>b.timestampMs)).size!==bars.length){excluded++;continue;}
 eligible++;const levels=knownLevels(day,overnight),events=new Map<number,number>();
 for(const level of levels){
  const e=firstWickRejection(day,level);if(!e||e.direction!=="SHORT")continue;
  const net=marketContextAt(day,levels,e.barIndex).trailingFiveNetPoints;
  if(net===null||net<=0)continue;
  candidates++;if(events.has(e.barIndex)){collapsed++;continue;}events.set(e.barIndex,e.barIndex);
 }
 let busyThrough=-1;
 for(const index of [...events.keys()].sort((a,b)=>a-b)){
  if(index<=busyThrough){skippedOverlap++;continue;}
  const sim=simulateFixedShort(day,index);
  if(!sim){skippedLate++;continue;}
  busyThrough=sim.exitIndex;
  trades.push({date,netPoints:sim.netPoints,reason:sim.reason,ambiguous:sim.ambiguousBar});
 }
}
const sum=trades.reduce((n,t)=>n+t.netPoints,0),wins=trades.filter(t=>t.netPoints>0),losses=trades.filter(t=>t.netPoints<0);
const sessions=[...new Set(trades.map(t=>t.date))],bySession=sessions.map(date=>({date,netPoints:Math.round(trades.filter(t=>t.date===date).reduce((n,t)=>n+t.netPoints,0)*100)/100,trades:trades.filter(t=>t.date===date).length}));
console.log("FEASIBILITY_SUMMARY",JSON.stringify({eligible,excluded,candidates,collapsedSameCandle:collapsed,skippedOverlap,skippedLate,trades:trades.length,distinctSessions:sessions.length,wins:wins.length,losses:losses.length,stops:trades.filter(t=>t.reason==="STOP").length,targets:trades.filter(t=>t.reason==="TARGET").length,timeExits:trades.filter(t=>t.reason==="TIME").length,ambiguousStopFirst:trades.filter(t=>t.ambiguous).length,totalNetPointsAfterAssumedCosts:Math.round(sum*100)/100,assumedRoundTripCostPoints:FIXED_SHORT_RULES.roundTripCostPoints,notValidatedPnl:true}));
for(const s of bySession)console.log("FEASIBILITY_SESSION",JSON.stringify(s));
console.log("FEASIBILITY_COMPLETE",JSON.stringify({inSample:true,onlyCountertrendShort:true,firstPerLevel:true,onePositionAtATime:true,nextBarOpen:true,stopPriority:true,gapStopAtOpen:true,tenBarsMax:true,feeSlippageProxyNotBrokerVerified:true,sessionClusteringRemains:true,noOutOfSampleApproval:true,noLiveOrders:true}));

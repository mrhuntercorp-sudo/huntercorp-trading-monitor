/** Full eligible historical first-reclaim census. Exploratory, not a strategy backtest. */
import {CachedHistoricalDays} from "../research/historical-cache.js";
import {auditRthCoverage} from "../research/rth-coverage.js";
import {overnightBars} from "../research/session-features.js";
import {knownLevels,firstReclaim,forwardExcursion,rthBars} from "../research/level-reclaim.js";
import {provisionalClosedDates,provisionalNqContract,isProvisionalRoll} from "./massive-nq-calendar-policy.js";
const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("NETWORK_DISABLED");}});
const dayMs=86400000,ms=(s:string)=>Date.parse(s+"T00:00:00Z"),iso=(t:number)=>new Date(t).toISOString().slice(0,10);
const dates:string[]=[];for(let t=ms("2026-10-02");dates.length<30;t-=dayMs){const d=iso(t),w=new Date(t).getUTCDay();if(w!==0&&w!==6&&!provisionalClosedDates.has(d))dates.push(d);}dates.reverse();
let eligible=0,excluded=0,rawEvents=0,uniqueEvents=0,fullForward=0,positiveClose=0,negativeClose=0,flatClose=0;
const loaded=new Map<string,Awaited<ReturnType<typeof cache.getDay>>>();
async function load(ticker:string,date:string){const key=ticker+"|"+date;if(!loaded.has(key))loaded.set(key,await cache.getDay({ticker,productCode:"NQ"},date));return loaded.get(key)!;}
console.log("=== TM001 HISTORICAL RECLAIM CENSUS ===");
console.log("EXPLORATORY_IN_SAMPLE | CACHE_ONLY | ZERO_API | ZERO_TRADES | NO_PNL | NO_OPTIMIZATION");
for(const date of dates){
 const ticker=provisionalNqContract(date),prior=iso(ms(date)-dayMs);
 const bars=[...await load(ticker,prior),...await load(ticker,date)].sort((a,b)=>a.timestampMs-b.timestampMs);
 const day=rthBars(bars,date),overnight=overnightBars(bars,date);
 const reason=isProvisionalRoll(date)?"ROLLOVER_UNVERIFIED":auditRthCoverage(day,date,ticker).status!=="COMPLETE"?"INCOMPLETE_RTH":overnight.length!==930||overnight.some((b,i)=>i>0&&b.timestampMs-overnight[i-1]!.timestampMs!==60000)?"INCOMPLETE_OVERNIGHT":new Set(bars.map(b=>b.timestampMs)).size!==bars.length?"DUPLICATE_BARS":null;
 if(reason){excluded++;console.log("CENSUS_EXCLUDED",JSON.stringify({date,reason}));continue;}
 eligible++;
 const seen=new Set<string>();
 for(const level of knownLevels(day,overnight)){
  const event=firstReclaim(day,level);
  if(!event)continue;
  rawEvents++;
  const key=[event.reclaimTimestampMs,event.price,event.direction].join("|");
  if(seen.has(key)){console.log("CENSUS_DUPLICATE_LEVEL",JSON.stringify({date,kind:level.kind,price:level.price,reclaimIndex:event.reclaimIndex}));continue;}
  seen.add(key);uniqueEvents++;
  const f=forwardExcursion(day,event,10);
  if(f.closeMovePoints!==null){fullForward++;if(f.closeMovePoints>0)positiveClose++;else if(f.closeMovePoints<0)negativeClose++;else flatClose++;}
  console.log("CENSUS_EVENT",JSON.stringify({date,level:level.kind,price:level.price,direction:event.direction,breakoutIndex:event.breakoutIndex,reclaimIndex:event.reclaimIndex,forwardBars:f.forwardBars,maxFavorablePoints:f.maxFavorablePoints,maxAdversePoints:f.maxAdversePoints,closeMovePoints:f.closeMovePoints,duplicatedLevelsDeduped:true,notTradablePnl:true}));
 }
}
console.log("CENSUS_SUMMARY",JSON.stringify({candidateSessions:dates.length,eligible,excluded,rawEvents,uniqueEvents,fullForward,positiveClose,negativeClose,flatClose,inSampleOnly:true,independentEventsNotGuaranteed:true,notAWinRate:true,noLiveApproval:true}));

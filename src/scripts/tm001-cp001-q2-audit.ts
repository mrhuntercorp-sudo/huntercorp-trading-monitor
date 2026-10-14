/** CP001-Q2 full-sample classification, fixed forward descriptive excursions.
 * Forward statistics are observations, NOT trade PnL or strategy validation.
 */
import {CachedHistoricalDays} from "../research/historical-cache.js";
import {aggregateCp001FiveMinute,detectCp001Flags} from "../research/cp001-flags.js";
import {detectCp001Shoulders} from "../research/cp001-shoulders.js";
import {classifyCp001} from "../research/cp001-classification.js";
import {rthBars} from "../research/level-reclaim.js";
import {auditRthCoverage} from "../research/rth-coverage.js";
import {provisionalClosedDates,provisionalNqContract,isProvisionalRoll} from "./massive-nq-calendar-policy.js";
const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("NETWORK_DISABLED_CACHE_ONLY");}});
const iso=(t:number)=>new Date(t).toISOString().slice(0,10),ms=(d:string)=>Date.parse(d+"T00:00:00Z");
const dates:string[]=[];for(let t=ms("2026-10-09");dates.length<35;t-=86400000){const d=iso(t),w=new Date(t).getUTCDay();if(w!==0&&w!==6&&!provisionalClosedDates.has(d))dates.push(d);}dates.reverse();
type Bucket={n:number;fullHorizon:number;sumMove:number;sumFavorable:number;sumAdverse:number;positive:number};
const buckets:Record<string,Bucket>={};const excluded:{date:string;reason:string}[]=[];
let eligible=0,total=0;
const horizon=6;
console.log("=== TM001 CP001-Q2 CLASSIFICATION AND FORWARD OBSERVATIONS ===");
console.log("CACHE_ONLY | ZERO_API | ZERO_ORDERS | NO_OPTIMIZATION | EXPOSED_HISTORY | NO_PNL");
for(const date of dates){
 if(isProvisionalRoll(date)){excluded.push({date,reason:"UNVERIFIED_ROLL"});continue;}
 const ticker=provisionalNqContract(date);let day;
 try{day=rthBars(await cache.getDay({ticker,productCode:"NQ"},date),date);}
 catch(e){excluded.push({date,reason:"CACHE_UNAVAILABLE:"+String(e instanceof Error?e.message:e)});continue;}
 if(auditRthCoverage(day,date,ticker).status!=="COMPLETE"){excluded.push({date,reason:"INCOMPLETE_RTH"});continue;}
 eligible++;
 const bars=aggregateCp001FiveMinute(day),patterns=[...detectCp001Flags(bars),...detectCp001Shoulders(bars)].sort((a,b)=>a.breakoutIndex-b.breakoutIndex);
 for(const p of patterns){
  total++;const cls=classifyCp001(bars,p);
  const bucket=buckets[cls.classification]??{n:0,fullHorizon:0,sumMove:0,sumFavorable:0,sumAdverse:0,positive:0};buckets[cls.classification]=bucket;bucket.n++;
  const next=bars.slice(p.breakoutIndex+1,p.breakoutIndex+1+horizon);
  const complete=next.length===horizon;
  const direction=p.pattern==="BULL_FLAG"||p.pattern==="INVERSE_HEAD_AND_SHOULDERS"?1:-1;
  const reference=bars[p.breakoutIndex]!.close;
  const closeMove=complete?direction*(next[horizon-1]!.close-reference):null;
  const favorable=complete?Math.max(0,...next.map(b=>direction===1?b.high-reference:reference-b.low)):null;
  const adverse=complete?Math.max(0,...next.map(b=>direction===1?reference-b.low:b.high-reference)):null;
  if(complete){bucket.fullHorizon++;bucket.sumMove+=closeMove!;bucket.sumFavorable+=favorable!;bucket.sumAdverse+=adverse!;if(closeMove!>0)bucket.positive++;}
  console.log("CP001_Q2_EVENT",JSON.stringify({date,pattern:p.pattern,breakoutIndex:p.breakoutIndex,classification:cls.classification,confirmationIntegrity:cls.confirmationIntegrity,qualityFlags:cls.flags,fullThirtyMinuteHorizon:complete,thirtyMinuteCloseMovePoints:closeMove,thirtyMinuteMaxFavorablePoints:favorable,thirtyMinuteMaxAdversePoints:adverse}));
 }
}
const result=Object.fromEntries(Object.entries(buckets).map(([name,b])=>[name,{count:b.n,completeThirtyMinuteObservations:b.fullHorizon,avgThirtyMinuteCloseMovePoints:b.fullHorizon?Number((b.sumMove/b.fullHorizon).toFixed(2)):null,avgMaxFavorablePoints:b.fullHorizon?Number((b.sumFavorable/b.fullHorizon).toFixed(2)):null,avgMaxAdversePoints:b.fullHorizon?Number((b.sumAdverse/b.fullHorizon).toFixed(2)):null,positiveThirtyMinuteCloses:b.positive}]));
console.log("CP001_Q2_SUMMARY",JSON.stringify({candidateDates:dates.length,eligible,total,classificationResults:result,forwardHorizonBars:6,barMinutes:5,reference:"CONFIRMATION_BAR_CLOSE_NOT_EXECUTABLE_FILL",excluded,detectorsUnchanged:true,classificationExploratory:true,allHistoryExposed:true,notPnL:true,notTradingApproved:true}));

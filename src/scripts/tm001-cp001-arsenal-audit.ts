/** CP001 combined four-pattern frequency audit, exposed cached NQ only. */
import {CachedHistoricalDays} from "../research/historical-cache.js";
import {aggregateCp001FiveMinute,detectCp001Flags} from "../research/cp001-flags.js";
import {detectCp001Shoulders} from "../research/cp001-shoulders.js";
import {rthBars} from "../research/level-reclaim.js";
import {auditRthCoverage} from "../research/rth-coverage.js";
import {provisionalClosedDates,provisionalNqContract,isProvisionalRoll} from "./massive-nq-calendar-policy.js";
const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("NETWORK_DISABLED_CACHE_ONLY");}});
const iso=(t:number)=>new Date(t).toISOString().slice(0,10),ms=(d:string)=>Date.parse(d+"T00:00:00Z");
const dates:string[]=[];for(let t=ms("2026-10-09");dates.length<35;t-=86400000){const d=iso(t),w=new Date(t).getUTCDay();if(w!==0&&w!==6&&!provisionalClosedDates.has(d))dates.push(d);}dates.reverse();
const counts:Record<string,number>={BULL_FLAG:0,BEAR_FLAG:0,HEAD_AND_SHOULDERS:0,INVERSE_HEAD_AND_SHOULDERS:0};
const excluded:{date:string;reason:string}[]=[];let eligible=0,daysWithAny=0,daysWithShoulders=0,overlapBars=0;
console.log("=== TM001 CP001 FOUR-PATTERN ARSENAL AUDIT ===");
console.log("CACHE_ONLY | ZERO_API | ZERO_SPEND | ZERO_ORDERS | NO_OPTIMIZATION | EXPOSED_HISTORY");
for(const date of dates){
 if(isProvisionalRoll(date)){excluded.push({date,reason:"UNVERIFIED_ROLL"});continue;}
 const ticker=provisionalNqContract(date);let day;
 try{day=rthBars(await cache.getDay({ticker,productCode:"NQ"},date),date);}
 catch(e){excluded.push({date,reason:"CACHE_UNAVAILABLE:"+String(e instanceof Error?e.message:e)});continue;}
 if(auditRthCoverage(day,date,ticker).status!=="COMPLETE"){excluded.push({date,reason:"INCOMPLETE_RTH"});continue;}
 eligible++;
 const bars=aggregateCp001FiveMinute(day),flags=detectCp001Flags(bars),shoulders=detectCp001Shoulders(bars);
 const all=[...flags,...shoulders].sort((a,b)=>a.breakoutIndex-b.breakoutIndex);
 if(all.length)daysWithAny++;if(shoulders.length)daysWithShoulders++;
 for(const p of all)counts[p.pattern]=(counts[p.pattern]??0)+1;
 overlapBars+=shoulders.filter(s=>flags.some(f=>f.breakoutIndex===s.breakoutIndex)).length;
 console.log("CP001_ARSENAL_DAY",JSON.stringify({date,total:all.length,patterns:all.map(p=>({pattern:p.pattern,breakoutIndex:p.breakoutIndex,confirmedUtc:new Date(p.breakoutTimeMs).toISOString(),...p}))}));
}
console.log("CP001_ARSENAL_SUMMARY",JSON.stringify({candidateDates:dates.length,eligible,daysWithAny,daysWithShoulders,counts,totalPatterns:Object.values(counts).reduce((a,b)=>a+b,0),sameBarFlagAndShoulderConfirmations:overlapBars,excluded,allExposed:true,requiresVisualReview:true,notProfitabilityBacktest:true}));
console.log("CP001_ARSENAL_RULES",JSON.stringify({timeframe:"5_MINUTE",flags:"UNCHANGED",shoulders:"TWO_LEFT_TWO_RIGHT_CONFIRMED_PIVOTS",minHeadExcessPoints:10,maxShoulderDifferenceVsHeadExcess:0.35,patternSpanBars:[8,40],necklineBreakWindowBars:12,necklineBreak:"FIRST_CLOSE_CROSS_BY_ONE_TICK",headShoulderRulesFrozenForThisBaseline:true}));
console.log("VALIDATION_STATUS",JSON.stringify({noApi:true,noOrders:true,cacheOnly:true,noOptimization:true,causalConfirmedPivots:true,allHistoricalDataExposed:true,notVisuallyValidated:true,freshHoldoutRequired:true,liveTradingApproved:false}));

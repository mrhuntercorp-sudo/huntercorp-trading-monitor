/** CP001 bull/bear flag frequency audit on exposed cached NQ RTH bars. */
import {CachedHistoricalDays} from "../research/historical-cache.js";
import {aggregateCp001FiveMinute,detectCp001Flags} from "../research/cp001-flags.js";
import {rthBars} from "../research/level-reclaim.js";
import {auditRthCoverage} from "../research/rth-coverage.js";
import {provisionalClosedDates,provisionalNqContract,isProvisionalRoll} from "./massive-nq-calendar-policy.js";
const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("NETWORK_DISABLED_CACHE_ONLY");}});
const iso=(t:number)=>new Date(t).toISOString().slice(0,10),ms=(d:string)=>Date.parse(d+"T00:00:00Z");
const dates:string[]=[];for(let t=ms("2026-10-09");dates.length<35;t-=86400000){const d=iso(t),w=new Date(t).getUTCDay();if(w!==0&&w!==6&&!provisionalClosedDates.has(d))dates.push(d);}dates.reverse();
const excluded:{date:string;reason:string}[]=[];let eligible=0,daysWithPatterns=0,bulls=0,bears=0,total=0,firstHalf=0,secondHalf=0;
console.log("=== TM001 CP001 FLAG DETECTION BASELINE ===");
console.log("CACHE_ONLY | ZERO_API | ZERO_SPEND | ZERO_ORDERS | NO_OPTIMIZATION | EXPOSED_HISTORY");
for(const date of dates){
 if(isProvisionalRoll(date)){excluded.push({date,reason:"UNVERIFIED_ROLL"});continue;}
 const ticker=provisionalNqContract(date);let day;
 try{day=rthBars(await cache.getDay({ticker,productCode:"NQ"},date),date);}
 catch(e){excluded.push({date,reason:"CACHE_UNAVAILABLE:"+String(e instanceof Error?e.message:e)});continue;}
 if(auditRthCoverage(day,date,ticker).status!=="COMPLETE"){excluded.push({date,reason:"INCOMPLETE_RTH"});continue;}
 eligible++;
 const bars=aggregateCp001FiveMinute(day),patterns=detectCp001Flags(bars);
 if(patterns.length)daysWithPatterns++;
 for(const p of patterns){total++;if(p.pattern==="BULL_FLAG")bulls++;else bears++;if(p.breakoutIndex<39)firstHalf++;else secondHalf++;}
 console.log("CP001_DAY",JSON.stringify({date,patterns:patterns.map(p=>({...p,breakoutUtc:new Date(p.breakoutTimeMs).toISOString()}))}));
}
console.log("CP001_SUMMARY",JSON.stringify({candidateDates:dates.length,eligible,daysWithPatterns,totalPatterns:total,bullFlags:bulls,bearFlags:bears,firstHalfRth:firstHalf,secondHalfRth:secondHalf,patternsPerEligibleDay:eligible?Math.round(100*total/eligible)/100:null,excluded,exposedHistoricalSample:true,signalOnly:true,notAProfitabilityBacktest:true}));
console.log("CP001_RULES",JSON.stringify({timeframe:"5_MINUTE",poleBars:3,minPolePoints:35,consolidationBars:[3,8],maxRetracementRatio:0.6,breakout:"CLOSE_BEYOND_CONSOLIDATION_AND_POLE_CLOSE_BY_AT_LEAST_ONE_TICK",noFutureLookahead:true,firstPatternOnly:false,headAndShouldersNotYetImplemented:true}));
console.log("VALIDATION_STATUS",JSON.stringify({noApi:true,noOrders:true,cacheOnly:true,noOptimization:true,signalOnly:true,allHistoricalDataExposed:true,requiresVisualPatternReview:true,liveTradingApproved:false}));

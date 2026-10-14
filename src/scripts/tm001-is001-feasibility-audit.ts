/** IS001 frozen signal, descriptive post-confirmation FVG feasibility. Cache only. */
import {CachedHistoricalDays} from "../research/historical-cache.js";
import {detectIs001} from "../research/is001-signals.js";
import {auditIs001Feasibility} from "../research/is001-feasibility.js";
import {rthBars} from "../research/level-reclaim.js";
import {auditRthCoverage} from "../research/rth-coverage.js";
import {provisionalClosedDates,provisionalNqContract,isProvisionalRoll} from "./massive-nq-calendar-policy.js";
const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("NETWORK_DISABLED_CACHE_ONLY");}});
const iso=(t:number)=>new Date(t).toISOString().slice(0,10),ms=(d:string)=>Date.parse(d+"T00:00:00Z");
const dates:string[]=[];for(let t=ms("2026-10-09");dates.length<35;t-=86400000){const d=iso(t),w=new Date(t).getUTCDay();if(w!==0&&w!==6&&!provisionalClosedDates.has(d))dates.push(d);}dates.reverse();
const excluded:{date:string;reason:string}[]=[],touchTimes:number[]=[],risks:number[]=[];
const statuses:Record<string,number>={TOUCH_BEFORE_INVALIDATION:0,INVALIDATED_BEFORE_TOUCH:0,SAME_BAR_AMBIGUOUS:0,NO_TOUCH_60M:0,NO_POST_SIGNAL_BARS:0};
const round=(x:number)=>Math.round(x*100)/100,avg=(xs:number[])=>xs.length?round(xs.reduce((a,b)=>a+b,0)/xs.length):null;
let eligible=0,signals=0,overlappingMssFvg=0;
console.log("=== TM001 IS001 FVG FEASIBILITY AUDIT ===");
console.log("CACHE_ONLY | ZERO_API | ZERO_SPEND | ZERO_ORDERS | NO_OPTIMIZATION | ALL_EXPOSED");
for(const date of dates){
 if(isProvisionalRoll(date)){excluded.push({date,reason:"UNVERIFIED_ROLL"});continue;}
 const ticker=provisionalNqContract(date);let day;
 try{day=rthBars(await cache.getDay({ticker,productCode:"NQ"},date),date);}
 catch(e){excluded.push({date,reason:"CACHE_UNAVAILABLE:"+String(e instanceof Error?e.message:e)});continue;}
 if(auditRthCoverage(day,date,ticker).status!=="COMPLETE"){excluded.push({date,reason:"INCOMPLETE_RTH"});continue;}
 eligible++;
 const s=detectIs001(day);if(!s){console.log("IS001_FEASIBILITY_DAY",JSON.stringify({date,status:"NO_SIGNAL"}));continue;}
 signals++;const f=auditIs001Feasibility(day,s);
 statuses[f.status]=(statuses[f.status]??0)+1;
 if(f.signalFvgSameBarAsMss)overlappingMssFvg++;
 if(f.status==="TOUCH_BEFORE_INVALIDATION"&&f.firstTouchMinutes!==null)touchTimes.push(f.firstTouchMinutes);
 risks.push(f.indicativeRiskPoints);
 console.log("IS001_FEASIBILITY_DAY",JSON.stringify({date,direction:s.direction,signalTimeUtc:new Date(s.signalTimeMs).toISOString(),fvgLow:s.fvgLow,fvgHigh:s.fvgHigh,liquidityLevel:s.liquidityLevel,...f,notAnOrderFill:true}));
}
console.log("IS001_FEASIBILITY_SUMMARY",JSON.stringify({candidateDates:dates.length,eligible,signals,statuses,unambiguousTouchPct:signals?round(100*statuses.TOUCH_BEFORE_INVALIDATION!/signals):null,avgFirstTouchMinutes:avg(touchTimes),avgIndicativeMidpointToLevelRisk:avg(risks),mssAndFvgSameBar:overlappingMssFvg,excluded,allExposed:true,notAnExecutionBacktest:true}));
console.log("VALIDATION_STATUS",JSON.stringify({signalDetectorUnchanged:true,postSignalOnly:true,zoneTouchNotMidpointFill:true,sameBarTouchInvalidationAmbiguous:true,noApi:true,noOrders:true,cacheOnly:true,noOptimization:true,freshHoldoutRequired:true,liveTradingApproved:false}));

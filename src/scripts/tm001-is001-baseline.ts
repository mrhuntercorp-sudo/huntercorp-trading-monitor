/** IS001 signal-frequency baseline; cached exposed NQ dates, no fills or optimization. */
import {CachedHistoricalDays} from "../research/historical-cache.js";
import {detectIs001} from "../research/is001-signals.js";
import {rthBars} from "../research/level-reclaim.js";
import {auditRthCoverage} from "../research/rth-coverage.js";
import {provisionalClosedDates,provisionalNqContract,isProvisionalRoll} from "./massive-nq-calendar-policy.js";
const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("NETWORK_DISABLED_CACHE_ONLY");}});
const iso=(t:number)=>new Date(t).toISOString().slice(0,10),ms=(d:string)=>Date.parse(d+"T00:00:00Z");
const dates:string[]=[];for(let t=ms("2026-10-09");dates.length<35;t-=86400000){const d=iso(t),w=new Date(t).getUTCDay();if(w!==0&&w!==6&&!provisionalClosedDates.has(d))dates.push(d);}dates.reverse();
const excluded:{date:string;reason:string}[]=[];let eligible=0,signals=0,longs=0,shorts=0;
const sweepToMss:number[]=[],mssToFvg:number[]=[],gapWidths:number[]=[];
const round=(x:number)=>Math.round(x*100)/100,avg=(xs:number[])=>xs.length?round(xs.reduce((a,b)=>a+b,0)/xs.length):null;
console.log("=== TM001 IS001 STRICT SIGNAL BASELINE ===");
console.log("CACHE_ONLY | ZERO_API | ZERO_SPEND | ZERO_ORDERS | NO_OPTIMIZATION | EXPOSED_HISTORY");
for(const date of dates){
 if(isProvisionalRoll(date)){excluded.push({date,reason:"UNVERIFIED_ROLL"});continue;}
 const ticker=provisionalNqContract(date);let day;
 try{day=rthBars(await cache.getDay({ticker,productCode:"NQ"},date),date);}
 catch(e){excluded.push({date,reason:"CACHE_UNAVAILABLE:"+String(e instanceof Error?e.message:e)});continue;}
 if(auditRthCoverage(day,date,ticker).status!=="COMPLETE"){excluded.push({date,reason:"INCOMPLETE_RTH"});continue;}
 eligible++;
 const s=detectIs001(day);if(!s){console.log("IS001_DAY",JSON.stringify({date,status:"NO_SIGNAL"}));continue;}
 signals++;if(s.direction==="LONG")longs++;else shorts++;
 sweepToMss.push(s.mssIndex-s.sweepIndex);mssToFvg.push(s.fvgIndex-s.mssIndex);gapWidths.push(s.fvgHigh-s.fvgLow);
 console.log("IS001_DAY",JSON.stringify({date,status:"SIGNAL",direction:s.direction,sweepMinuteAfterOpen:s.sweepIndex,mssMinuteAfterOpen:s.mssIndex,fvgMinuteAfterOpen:s.fvgIndex,signalTimeUtc:new Date(s.signalTimeMs).toISOString(),liquidityLevel:s.liquidityLevel,structureLevel:s.structureLevel,fvgLow:s.fvgLow,fvgHigh:s.fvgHigh,notAnEntry:true}));
}
console.log("IS001_SUMMARY",JSON.stringify({candidateDates:dates.length,eligible,signals,longs,shorts,signalDaysPct:eligible?round(100*signals/eligible):null,avgSweepToMssMinutes:avg(sweepToMss),avgMssToFvgMinutes:avg(mssToFvg),avgFvgWidthPoints:avg(gapWidths),excluded,signalOnly:true,noExecutionBacktest:true,exposedHistoricalSample:true}));
console.log("VALIDATION_STATUS",JSON.stringify({noApi:true,noOrders:true,cacheOnly:true,noOptimization:true,signalOnly:true,allHistoricalDataExposed:true,freshHoldoutRequired:true,liveTradingApproved:false}));

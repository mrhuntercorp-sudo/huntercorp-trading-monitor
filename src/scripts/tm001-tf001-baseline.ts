/** TF001 descriptive cache-only baseline. No order execution, optimization or API access. */
import {CachedHistoricalDays} from "../research/historical-cache.js";
import {detectTf001} from "../research/tf001-signals.js";
import {rthBars} from "../research/level-reclaim.js";
import {auditRthCoverage} from "../research/rth-coverage.js";
import {provisionalClosedDates,provisionalNqContract,isProvisionalRoll} from "./massive-nq-calendar-policy.js";
const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("NETWORK_DISABLED_CACHE_ONLY");}});
const iso=(t:number)=>new Date(t).toISOString().slice(0,10),ms=(d:string)=>Date.parse(d+"T00:00:00Z");
const dates:string[]=[];for(let t=ms("2026-10-09");dates.length<35;t-=86400000){const d=iso(t),w=new Date(t).getUTCDay();if(w!==0&&w!==6&&!provisionalClosedDates.has(d))dates.push(d);}dates.reverse();
const round=(n:number)=>Math.round(n*100)/100,avg=(a:number[])=>a.length?round(a.reduce((x,y)=>x+y,0)/a.length):null;
const excluded:{date:string;reason:string}[]=[],moves30:number[]=[],moves60:number[]=[],risk:number[]=[];
let eligible=0,signals=0,longs=0,shorts=0;
console.log("=== TM001 TF001 TREND SIGNAL BASELINE ===");
console.log("CACHE_ONLY | ZERO_API | ZERO_SPEND | ZERO_ORDERS | NO_OPTIMIZATION | EXPOSED_SAMPLE");
for(const date of dates){
 if(isProvisionalRoll(date)){excluded.push({date,reason:"UNVERIFIED_ROLL"});continue;}
 const ticker=provisionalNqContract(date);let day;
 try{day=rthBars(await cache.getDay({ticker,productCode:"NQ"},date),date);}
 catch(e){excluded.push({date,reason:"CACHE_UNAVAILABLE:"+String(e instanceof Error?e.message:e)});continue;}
 if(auditRthCoverage(day,date,ticker).status!=="COMPLETE"){excluded.push({date,reason:"INCOMPLETE_RTH"});continue;}
 eligible++;
 const s=detectTf001(day);if(!s){console.log("TF001_DAY",JSON.stringify({date,status:"NO_SIGNAL"}));continue;}
 const i=day.findIndex(b=>b.timestampMs===s.entryTimeMs),sign=s.direction==="LONG"?1:-1;
 const move=(n:number)=>day[i+n]?round(sign*(day[i+n]!.open-s.entryPrice)-2):null;
 const m30=move(30),m60=move(60),stopDistance=round(Math.abs(s.entryPrice-s.initialStop));
 signals++;if(sign===1)longs++;else shorts++;risk.push(stopDistance);
 if(m30!==null)moves30.push(m30);if(m60!==null)moves60.push(m60);
 console.log("TF001_DAY",JSON.stringify({date,status:"SIGNAL",direction:s.direction,entryTimeUtc:new Date(s.entryTimeMs).toISOString(),entryPrice:s.entryPrice,initialStop:s.initialStop,stopDistance,ema20:round(s.ema20),ema50:round(s.ema50),net30m:m30,net60m:m60,frictionAssumedPoints:2,notPathwiseExecution:true}));
}
console.log("TF001_SUMMARY",JSON.stringify({candidateDates:dates.length,eligible,signals,longs,shorts,avgInitialStopDistance:avg(risk),avgNet30m:avg(moves30),count30m:moves30.length,avgNet60m:avg(moves60),count60m:moves60.length,excluded,exposedHistoricalSample:true,noTrailingExitBacktestYet:true}));
console.log("VALIDATION_STATUS",JSON.stringify({noOrders:true,noApi:true,cacheOnly:true,signalRulesFrozenForBaseline:true,descriptiveOnly:true,allHistoricalDataExposed:true,freshHoldoutRequired:true,liveTradingApproved:false}));

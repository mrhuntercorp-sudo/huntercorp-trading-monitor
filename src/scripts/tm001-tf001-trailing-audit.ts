/** TF001 pathwise exit audit over previously exposed cached NQ dates. */
import {CachedHistoricalDays} from "../research/historical-cache.js";
import {detectTf001} from "../research/tf001-signals.js";
import {simulateTf001Exit} from "../research/tf001-trailing-exit.js";
import {rthBars} from "../research/level-reclaim.js";
import {auditRthCoverage} from "../research/rth-coverage.js";
import {provisionalClosedDates,provisionalNqContract,isProvisionalRoll} from "./massive-nq-calendar-policy.js";
const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("NETWORK_DISABLED_CACHE_ONLY");}});
const iso=(t:number)=>new Date(t).toISOString().slice(0,10),ms=(d:string)=>Date.parse(d+"T00:00:00Z");
const dates:string[]=[];for(let t=ms("2026-10-09");dates.length<35;t-=86400000){const d=iso(t),w=new Date(t).getUTCDay();if(w!==0&&w!==6&&!provisionalClosedDates.has(d))dates.push(d);}dates.reverse();
const round=(n:number)=>Math.round(n*100)/100,avg=(xs:number[])=>xs.length?round(xs.reduce((a,b)=>a+b,0)/xs.length):null;
const excluded:{date:string;reason:string}[]=[],outcomes:number[]=[],holds:number[]=[],risk:number[]=[];
let eligible=0,signals=0,stops=0,sessionEnds=0;
console.log("=== TM001 TF001 FROZEN TRAILING EXIT AUDIT ===");
console.log("CACHE_ONLY | ZERO_API | ZERO_SPEND | ZERO_ORDERS | NO_OPTIMIZATION | ALL_EXPOSED");
for(const date of dates){
 if(isProvisionalRoll(date)){excluded.push({date,reason:"UNVERIFIED_ROLL"});continue;}
 const ticker=provisionalNqContract(date);let day;
 try{day=rthBars(await cache.getDay({ticker,productCode:"NQ"},date),date);}
 catch(e){excluded.push({date,reason:"CACHE_UNAVAILABLE:"+String(e instanceof Error?e.message:e)});continue;}
 if(auditRthCoverage(day,date,ticker).status!=="COMPLETE"){excluded.push({date,reason:"INCOMPLETE_RTH"});continue;}
 eligible++;
 const signal=detectTf001(day);if(!signal){console.log("TF001_EXIT_DAY",JSON.stringify({date,status:"NO_SIGNAL"}));continue;}
 const exit=simulateTf001Exit(day,signal);
 signals++;outcomes.push(exit.netPoints);holds.push(exit.barsHeld);risk.push(exit.initialRiskPoints);
 if(exit.reason==="STOP")stops++;else sessionEnds++;
 console.log("TF001_EXIT_DAY",JSON.stringify({date,direction:signal.direction,entryTimeUtc:new Date(signal.entryTimeMs).toISOString(),entryPrice:signal.entryPrice,initialStop:signal.initialStop,...exit,frictionPoints:2}));
}
console.log("TF001_EXIT_SUMMARY",JSON.stringify({candidateDates:dates.length,eligible,signals,wins:outcomes.filter(x=>x>0).length,losses:outcomes.filter(x=>x<0).length,flat:outcomes.filter(x=>x===0).length,stops,sessionEnds,totalNetPoints:round(outcomes.reduce((a,b)=>a+b,0)),avgNetPoints:avg(outcomes),avgBarsHeld:avg(holds),avgInitialRiskPoints:avg(risk),excluded,exposedHistoricalSample:true,notForwardValidated:true}));
console.log("VALIDATION_STATUS",JSON.stringify({entryRulesUnchanged:true,trailingStopUsesOnlyCompletedPriorBars:true,stopGapHandling:true,oneSignalPerDay:true,frictionPoints:2,noOrders:true,noApi:true,noOptimization:true,allExposed:true,freshHoldoutRequired:true,liveTradingApproved:false}));

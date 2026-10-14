/** IS001 midpoint-limit historical audit; exposed cache, no orders/API/optimization. */
import {CachedHistoricalDays} from "../research/historical-cache.js";
import {detectIs001} from "../research/is001-signals.js";
import {simulateIs001Execution} from "../research/is001-execution.js";
import {rthBars} from "../research/level-reclaim.js";
import {auditRthCoverage} from "../research/rth-coverage.js";
import {provisionalClosedDates,provisionalNqContract,isProvisionalRoll} from "./massive-nq-calendar-policy.js";
const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("NETWORK_DISABLED_CACHE_ONLY");}});
const iso=(t:number)=>new Date(t).toISOString().slice(0,10),ms=(d:string)=>Date.parse(d+"T00:00:00Z");
const dates:string[]=[];for(let t=ms("2026-10-09");dates.length<35;t-=86400000){const d=iso(t),w=new Date(t).getUTCDay();if(w!==0&&w!==6&&!provisionalClosedDates.has(d))dates.push(d);}dates.reverse();
const statuses:Record<string,number>={UNFILLED:0,INVALIDATED_PRE_FILL:0,AMBIGUOUS_FILL_STOP:0,STOPPED:0,SESSION_END:0};
const excluded:{date:string;reason:string}[]=[],values:number[]=[],risks:number[]=[],waits:number[]=[];
const round=(n:number)=>Math.round(n*100)/100,avg=(xs:number[])=>xs.length?round(xs.reduce((a,b)=>a+b,0)/xs.length):null,sum=(xs:number[])=>xs.reduce((a,b)=>a+b,0);
let eligible=0,signals=0,sameBarMssFvg=0;
console.log("=== TM001 IS001 FROZEN MIDPOINT EXECUTION AUDIT ===");
console.log("CACHE_ONLY | ZERO_API | ZERO_SPEND | ZERO_ORDERS | NO_OPTIMIZATION | EXPOSED_HISTORY");
for(const date of dates){
 if(isProvisionalRoll(date)){excluded.push({date,reason:"UNVERIFIED_ROLL"});continue;}
 const ticker=provisionalNqContract(date);let day;
 try{day=rthBars(await cache.getDay({ticker,productCode:"NQ"},date),date);}
 catch(e){excluded.push({date,reason:"CACHE_UNAVAILABLE:"+String(e instanceof Error?e.message:e)});continue;}
 if(auditRthCoverage(day,date,ticker).status!=="COMPLETE"){excluded.push({date,reason:"INCOMPLETE_RTH"});continue;}
 eligible++;
 const s=detectIs001(day);if(!s){console.log("IS001_EXECUTION_DAY",JSON.stringify({date,status:"NO_SIGNAL"}));continue;}
 signals++;if(s.mssIndex===s.fvgIndex)sameBarMssFvg++;
 const x=simulateIs001Execution(day,s);statuses[x.status]=(statuses[x.status]??0)+1;
 risks.push(x.initialRiskPoints);
 if(x.netPoints!==null)values.push(x.netPoints);
 if(x.fillWaitMinutes!==null&&x.status!=="AMBIGUOUS_FILL_STOP")waits.push(x.fillWaitMinutes);
 console.log("IS001_EXECUTION_DAY",JSON.stringify({date,direction:s.direction,signalTimeUtc:new Date(s.signalTimeMs).toISOString(),fvgLow:s.fvgLow,fvgHigh:s.fvgHigh,mssSameAsFvg:s.mssIndex===s.fvgIndex,...x,simulatedNotBrokerFill:true}));
}
const wins=values.filter(x=>x>0),losses=values.filter(x=>x<0);
const grossWin=sum(wins),grossLoss=-sum(losses);
let equity=0,peak=0,maxDrawdown=0;
for(const v of values){equity+=v;peak=Math.max(peak,equity);maxDrawdown=Math.max(maxDrawdown,peak-equity);}
console.log("IS001_EXECUTION_SUMMARY",JSON.stringify({candidateDates:dates.length,eligible,signals,statuses,unambiguousFilledTrades:values.length,filledPctOfSignals:signals?round(100*values.length/signals):null,winCount:wins.length,lossCount:losses.length,winRatePct:values.length?round(100*wins.length/values.length):null,totalNetPoints:round(sum(values)),avgNetPoints:avg(values),avgWinner:avg(wins),avgLoser:avg(losses),profitFactor:grossLoss?round(grossWin/grossLoss):null,maxClosedTradeDrawdownPoints:round(maxDrawdown),avgInitialRiskPoints:avg(risks),avgFillWaitMinutes:avg(waits),sameBarMssFvg,excluded,allExposed:true}));
console.log("EXECUTION_ASSUMPTIONS",JSON.stringify({entry:"MIDPOINT_LIMIT_AFTER_FVG_CLOSE",entryExpiryBars:60,stop:"SWEPT_LIQUIDITY_PLUS_ONE_TICK_BUFFER",frictionPoints:2,entryAtLimitNotBetterThanLimit:true,sameBarEntryStopExcludedAsAmbiguous:true,stopGapWorseOfOpenOrStop:true,noProfitTarget:true,sessionCloseExit:true,noQueuePositionOrPartialFills:true,oneMinuteOhlcOnly:true}));
console.log("VALIDATION_STATUS",JSON.stringify({signalRulesUnchanged:true,noApi:true,noOrders:true,cacheOnly:true,noOptimization:true,notBrokerFillEvidence:true,allHistoricalDataExposed:true,freshHoldoutRequired:true,liveTradingApproved:false}));

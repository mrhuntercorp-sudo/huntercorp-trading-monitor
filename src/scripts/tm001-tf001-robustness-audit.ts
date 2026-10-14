/** TF001 robustness audit. Frozen signals/exits, exposed cached history, no parameter selection. */
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
type Trade={date:string;direction:"LONG"|"SHORT";entryPrice:number;exitPrice:number;exitReason:string;barsHeld:number;initialStop:number;finalStop:number;initialRisk:number;netPoints:number;gapBeyondStop:boolean;stopOnEntryBar:boolean};
const trades:Trade[]=[],excluded:{date:string;reason:string}[]=[];let eligible=0;
console.log("=== TM001 TF001 FROZEN ROBUSTNESS AUDIT ===");
console.log("CACHE_ONLY | ZERO_API | ZERO_SPEND | ZERO_ORDERS | NO_OPTIMIZATION | EXPOSED_HISTORY");
for(const date of dates){
 if(isProvisionalRoll(date)){excluded.push({date,reason:"UNVERIFIED_ROLL"});continue;}
 const ticker=provisionalNqContract(date);let day;
 try{day=rthBars(await cache.getDay({ticker,productCode:"NQ"},date),date);}
 catch(e){excluded.push({date,reason:"CACHE_UNAVAILABLE:"+String(e instanceof Error?e.message:e)});continue;}
 if(auditRthCoverage(day,date,ticker).status!=="COMPLETE"){excluded.push({date,reason:"INCOMPLETE_RTH"});continue;}
 eligible++;
 const s=detectTf001(day);if(!s){console.log("TF001_ROBUSTNESS_DAY",JSON.stringify({date,status:"NO_SIGNAL"}));continue;}
 const x=simulateTf001Exit(day,s,2);
 const entryIdx=day.findIndex(b=>b.timestampMs===s.entryTimeMs);
 const exitIdx=day.findIndex(b=>b.timestampMs===x.exitTimeMs);
 const gapBeyondStop=x.reason==="STOP"&&(s.direction==="LONG"?x.exitPrice<x.finalStop:x.exitPrice>x.finalStop);
 const trade:Trade={date,direction:s.direction,entryPrice:s.entryPrice,exitPrice:x.exitPrice,exitReason:x.reason,barsHeld:x.barsHeld,initialStop:s.initialStop,finalStop:x.finalStop,initialRisk:x.initialRiskPoints,netPoints:x.netPoints,gapBeyondStop,stopOnEntryBar:entryIdx===exitIdx};
 trades.push(trade);
 console.log("TF001_ROBUSTNESS_DAY",JSON.stringify(trade));
}
const values=trades.map(x=>x.netPoints),wins=values.filter(x=>x>0),losses=values.filter(x=>x<0);
const grossProfit=wins.reduce((a,b)=>a+b,0),grossLoss=-losses.reduce((a,b)=>a+b,0);
let equity=0,peak=0,maxDrawdown=0;
for(const v of values){equity+=v;peak=Math.max(peak,equity);maxDrawdown=Math.max(maxDrawdown,peak-equity);}
const top=[...wins].sort((a,b)=>b-a);
const sum=(xs:number[])=>xs.reduce((a,b)=>a+b,0);
console.log("TF001_ROBUSTNESS_SUMMARY",JSON.stringify({candidateDates:dates.length,eligible,trades:trades.length,wins:wins.length,losses:losses.length,winRatePct:values.length?round(100*wins.length/values.length):null,totalNetPoints:round(sum(values)),meanNetPoints:avg(values),medianNetPoints:values.length?round([...values].sort((a,b)=>a-b)[Math.floor((values.length-1)/2)]!):null,avgWinner:avg(wins),avgLoser:avg(losses),grossProfit:round(grossProfit),grossLoss:round(grossLoss),profitFactor:grossLoss?round(grossProfit/grossLoss):null,maxClosedTradeDrawdownPoints:round(maxDrawdown),topWinnerPoints:top[0]??null,topThreeWinnerPoints:round(sum(top.slice(0,3))),netExcludingLargestWinner:round(sum(values)-(top[0]??0)),netExcludingTopThreeWinners:round(sum(values)-sum(top.slice(0,3))),stopOnEntryBar:trades.filter(x=>x.stopOnEntryBar).length,gapBeyondStop:trades.filter(x=>x.gapBeyondStop).length,excluded}));
for(const extra of [0,1,2,4]){const adjusted=values.map(x=>x-extra),profit=sum(adjusted.filter(x=>x>0)),loss=-sum(adjusted.filter(x=>x<0));console.log("TF001_FRICTION_SENSITIVITY",JSON.stringify({baseFrictionPoints:2,additionalFrictionPoints:extra,totalFrictionPoints:2+extra,totalNetPoints:round(sum(adjusted)),avgNetPoints:avg(adjusted),wins:adjusted.filter(x=>x>0).length,profitFactor:loss?round(profit/loss):null}));}
console.log("TF001_EXECUTION_REVIEW",JSON.stringify({stopTightenedOnlyFromPreviousFiveCompletedBars:true,stopCheckedAfterTighteningAtBarOpen:true,stopGapFillUsesWorseOfOpenOrStop:true,minuteOhlcIntrabarOrderingUnknown:true,entryNextMinuteOpenAssumed:true,commissionAndSlippageModeledAsFixedPoints:true,tradeLevelAuditAvailable:true,notBrokerFillEvidence:true}));
console.log("VALIDATION_STATUS",JSON.stringify({entryRulesUnchanged:true,exitRulesUnchanged:true,noApi:true,noOrders:true,cacheOnly:true,allHistoricalDataExposed:true,notForwardValidated:true,liveTradingApproved:false}));

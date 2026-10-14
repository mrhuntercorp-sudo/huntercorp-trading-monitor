/** TM001 frozen P4 validation: read-only diagnostic, no optimization or orders. */
import {CachedHistoricalDays} from "../research/historical-cache.js";
import {auditRthCoverage} from "../research/rth-coverage.js";
import {overnightBars} from "../research/session-features.js";
import {rthBars} from "../research/level-reclaim.js";
import {generateP4Signals} from "../research/p4-nq-signals.js";
import {newYorkClock} from "../market/time.js";
import {provisionalClosedDates,provisionalNqContract,isProvisionalRoll} from "./massive-nq-calendar-policy.js";
import type {MinuteBar} from "../market/types.js";

const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("NETWORK_DISABLED");}});
const ms=(s:string)=>Date.parse(s+"T00:00:00Z");
const iso=(t:number)=>new Date(t).toISOString().slice(0,10);
const dates:string[]=[];
for(let t=ms("2026-10-02");dates.length<30;t-=86400000){const d=iso(t),w=new Date(t).getUTCDay();if(w!==0&&w!==6&&!provisionalClosedDates.has(d))dates.push(d);}
dates.reverse();
const periods=[{name:"IN_SAMPLE_EXPOSED",dates},{name:"OOS1_EXPOSED_NOT_FRESH",dates:["2026-10-05","2026-10-06","2026-10-07","2026-10-08","2026-10-09"]}];
const loaded=new Map<string,MinuteBar[]>();
async function load(ticker:string,date:string){const key=ticker+"|"+date;if(!loaded.has(key))loaded.set(key,await cache.getDay({ticker,productCode:"NQ"},date));return loaded.get(key)!;}
const clock=(t:number)=>{const c=newYorkClock(t);return c.date+" "+String(c.hour).padStart(2,"0")+":"+String(c.minute).padStart(2,"0")+" ET";};
const round=(n:number)=>Math.round(n*100)/100;
console.log("=== TM001 FROZEN TREND VALIDATION AUDIT ===");
console.log("CACHE_ONLY | ZERO_API | ZERO_SPEND | ZERO_ORDERS | NO_OPTIMIZATION | ALL_SAMPLES_EXPOSED");
console.log("FROZEN_RULES",JSON.stringify({strategy:"SESSION_TREND_PULLBACK_V1",stopPoints:10,targetPoints:40,maxHoldMinutes:30,entry:"NEXT_BAR_OPEN",firstSignalPerDay:true,baseCostPoints:2}));
for(const period of periods){
 let eligible=0;const excluded:{date:string;reason:string}[]=[];
 const trades:{date:string;direction:string;signalTime:string;entryTime:string;entry:number;stop:number;target:number;exitTime:string;exit:number;reason:string;gross:number;net:number;mae:number;mfe:number;stopEntryBar:boolean;ambiguous:boolean;entryBarRange:number;maxBarRange:number}[]=[];
 for(const date of period.dates){
  const ticker=period.name==="OOS1_EXPOSED_NOT_FRESH"?"NQZ6":provisionalNqContract(date);
  const prior=iso(ms(date)-86400000);
  const bars=[...await load(ticker,prior),...await load(ticker,date)].sort((a,b)=>a.timestampMs-b.timestampMs);
  const day=rthBars(bars,date),overnight=overnightBars(bars,date);
  let reason="";
  if(period.name==="IN_SAMPLE_EXPOSED"&&isProvisionalRoll(date))reason="UNVERIFIED_ROLL";
  else if(new Set(bars.map(b=>b.timestampMs)).size!==bars.length)reason="DUPLICATE_TIMESTAMPS";
  else if(auditRthCoverage(day,date,ticker).status!=="COMPLETE")reason="INCOMPLETE_RTH";
  else if(overnight.length!==930||overnight.some((b,i)=>i>0&&b.timestampMs-overnight[i-1]!.timestampMs!==60000))reason="INCOMPLETE_OVERNIGHT";
  if(reason){excluded.push({date,reason});continue;}
  eligible++;
  const signals=generateP4Signals({bars:day,contractVerified:true,calendarVerified:true},"SESSION_TREND_PULLBACK_V1",10);
  for(const s of signals){
   const i=day.findIndex(b=>b.timestampMs===s.entryTime);
   if(i<0)throw Error("MISSING_ENTRY "+date);
   const c=newYorkClock(s.entryTime),minute=c.hour*60+c.minute;
   if(minute>=660)continue;
   const sign=s.direction==="LONG"?1:-1,deadline=Math.min(s.timeExitMs,day.at(-1)!.timestampMs);
   let exit=s.entryPrice,exitIndex=i,reason="TIME",ambiguous=false,mae=0,mfe=0,maxBarRange=0;
   for(let j=i;j<day.length;j++){
    const b=day[j]!;
    if(b.timestampMs>=deadline){exit=b.open;exitIndex=j;break;}
    if(j===day.length-1){exit=b.close;exitIndex=j;reason="SESSION_END";break;}
    const adverse=sign===1?s.entryPrice-b.low:b.high-s.entryPrice;
    const favorable=sign===1?b.high-s.entryPrice:s.entryPrice-b.low;
    mae=Math.max(mae,adverse);mfe=Math.max(mfe,favorable);maxBarRange=Math.max(maxBarRange,b.high-b.low);
    const stopHit=sign===1?b.low<=s.stopPrice:b.high>=s.stopPrice;
    const targetHit=sign===1?b.high>=s.targetPrice:b.low<=s.targetPrice;
    if(stopHit){ambiguous=targetHit;exit=sign===1?Math.min(s.stopPrice,b.open):Math.max(s.stopPrice,b.open);exitIndex=j;reason="STOP";break;}
    if(targetHit){exit=s.targetPrice;exitIndex=j;reason="TARGET";break;}
   }
   const gross=(exit-s.entryPrice)*sign;
   trades.push({date,direction:s.direction,signalTime:clock(s.signalTime),entryTime:clock(s.entryTime),entry:s.entryPrice,stop:s.stopPrice,target:s.targetPrice,exitTime:clock(day[exitIndex]!.timestampMs),exit,reason,gross:round(gross),net:round(gross-2),mae:round(mae),mfe:round(mfe),stopEntryBar:reason==="STOP"&&exitIndex===i,ambiguous,entryBarRange:round(day[i]!.high-day[i]!.low),maxBarRange:round(maxBarRange)});
  }
 }
 let equity=0,peak=0,dd=0;
 for(const t of trades){equity+=t.net;peak=Math.max(peak,equity);dd=Math.max(dd,peak-equity);console.log("TREND_TRADE",JSON.stringify({period:period.name,...t}));}
 const net=round(equity);
 console.log("PERIOD_SUMMARY",JSON.stringify({period:period.name,candidateDates:period.dates.length,eligible,excluded,trades:trades.length,targets:trades.filter(t=>t.reason==="TARGET").length,stops:trades.filter(t=>t.reason==="STOP").length,netPoints:net,averagePoints:trades.length?round(net/trades.length):null,maxClosedDrawdownPoints:round(dd),entryBarStops:trades.filter(t=>t.stopEntryBar).length,entryBarRangeAtLeast10:trades.filter(t=>t.entryBarRange>=10).length,maxBarRangeAtLeast10:trades.filter(t=>t.maxBarRange>=10).length,ambiguousBars:trades.filter(t=>t.ambiguous).length,netWithExtra2PointsPerTrade:round(net-2*trades.length),netWithExtra4PointsPerTrade:round(net-4*trades.length),allEvidenceExposed:true,notExecutionCertified:true}));
 for(const mll of [2000,3000])for(const contracts of [1,2,3,5,10]){
  const usdPerPoint=contracts*2,stopRisk=10*usdPerPoint,daily=mll*.15,operating=mll*.5;
  console.log("MNQ_STATIC_RISK",JSON.stringify({period:period.name,mllUsd:mll,contracts,usdPerPoint,nominalStopUsd:stopRisk,dailyBudgetUsd:daily,operatingBudgetUsd:operating,stopWithinDailyBudget:stopRisk<=daily,stopWithinOperatingBudget:stopRisk<=operating,includesFeesOrSlippage:false,accountSurvivalCertified:false}));
 }
}
console.log("VALIDATION_STATUS",JSON.stringify({inSampleNotHoldout:true,oct5To9NotFresh:true,priorOosRejectionPreserved:true,executionUnverified:true,accountRiskNeedsIntegratedReplay:true,newUnseenDataRequired:true,liveTradingApproved:false}));

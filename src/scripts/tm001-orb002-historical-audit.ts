/** TM001 ORB002: cached historical comparison; no APIs, orders or parameter selection. */
import {CachedHistoricalDays} from "../research/historical-cache.js";
import {detectOvernightBreakout,type OvernightVariant} from "../research/overnight-breakout-signals.js";
import {rthBars} from "../research/level-reclaim.js";
import {auditRthCoverage} from "../research/rth-coverage.js";
import {provisionalClosedDates,provisionalNqContract,isProvisionalRoll} from "./massive-nq-calendar-policy.js";
import type {MinuteBar} from "../market/types.js";
const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("NETWORK_DISABLED_CACHE_ONLY");}});
const iso=(t:number)=>new Date(t).toISOString().slice(0,10),ms=(d:string)=>Date.parse(d+"T00:00:00Z");
const dates:string[]=[];
for(let t=ms("2026-10-09");dates.length<35;t-=86400000){const d=iso(t),w=new Date(t).getUTCDay();if(w!==0&&w!==6&&!provisionalClosedDates.has(d))dates.push(d);}
dates.reverse();
const variants:OvernightVariant[]=["ORB002_LONDON","ORB002_FULL_OVERNIGHT"];
const round=(x:number)=>Math.round(x*100)/100;
async function day(ticker:string,date:string){return cache.getDay({ticker,productCode:"NQ"},date);}
const results:Record<string,{signals:number;longs:number;shorts:number;next30Mean:number[];next60Mean:number[];rangeWidths:number[]}>={};
for(const v of variants)results[v]={signals:0,longs:0,shorts:0,next30Mean:[],next60Mean:[],rangeWidths:[]};
let eligible=0;const excluded:{date:string;reason:string}[]=[];
console.log("=== TM001 ORB002 EXPOSED HISTORICAL DESCRIPTIVE COMPARISON ===");
console.log("CACHE_ONLY | ZERO_API | ZERO_ORDERS | ZERO_SPEND | NO_OPTIMIZATION | NO_STRATEGY_APPROVAL");
for(const date of dates){
 const ticker=provisionalNqContract(date),previous=iso(ms(date)-86400000);
 let bars:MinuteBar[];
 try{
  const a=await day(ticker,previous),b=await day(ticker,date);
  bars=[...a,...b].sort((x,y)=>x.timestampMs-y.timestampMs);
 }catch(e){excluded.push({date,reason:"CACHE_UNAVAILABLE:"+String(e instanceof Error?e.message:e)});continue;}
 if(isProvisionalRoll(date)){excluded.push({date,reason:"UNVERIFIED_ROLL"});continue;}
 const rth=rthBars(bars,date);
 if(auditRthCoverage(rth,date,ticker).status!=="COMPLETE"){excluded.push({date,reason:"INCOMPLETE_RTH"});continue;}
 const detected:Partial<Record<OvernightVariant,ReturnType<typeof detectOvernightBreakout>>>={};
 try{for(const v of variants)detected[v]=detectOvernightBreakout(bars,date,v);}
 catch(e){excluded.push({date,reason:String(e instanceof Error?e.message:e)});continue;}
 eligible++;
 for(const variant of variants){
  const signal=detected[variant]??null;
  if(!signal){console.log("ORB002_DAY",JSON.stringify({date,variant,status:"NO_BREAKOUT"}));continue;}
  const entryIndex=rth.findIndex(b=>b.timestampMs===signal.earliestEntryMs);
  if(entryIndex<0){console.log("ORB002_DAY",JSON.stringify({date,variant,status:"SIGNAL_NO_NEXT_RTH_BAR",direction:signal.direction}));continue;}
  const entry=rth[entryIndex]!.open,sign=signal.direction==="LONG"?1:-1;
  const forward=(n:number)=>{const exit=rth[entryIndex+n];return exit?round(sign*(exit.open-entry)-2):null;};
  const r=results[variant]!;
  r.signals++;if(sign===1)r.longs++;else r.shorts++;
  const p30=forward(30),p60=forward(60);
  if(p30!==null)r.next30Mean.push(p30);
  if(p60!==null)r.next60Mean.push(p60);
  r.rangeWidths.push(round(signal.overnightHigh-signal.overnightLow));
  console.log("ORB002_DAY",JSON.stringify({date,variant,status:"SIGNAL",direction:signal.direction,signalCloseEt:new Date(signal.signalCloseMs).toISOString(),overnightHigh:signal.overnightHigh,overnightLow:signal.overnightLow,entryPrice:entry,netChange30m:p30,netChange60m:p60,frictionAssumedPoints:2,descriptiveOnly:true}));
 }
}
const avg=(xs:number[])=>xs.length?round(xs.reduce((a,b)=>a+b,0)/xs.length):null;
for(const variant of variants){const r=results[variant]!;console.log("ORB002_SUMMARY",JSON.stringify({variant,signals:r.signals,longs:r.longs,shorts:r.shorts,avgRangeWidth:avg(r.rangeWidths),avgNet30m:avg(r.next30Mean),count30m:r.next30Mean.length,avgNet60m:avg(r.next60Mean),count60m:r.next60Mean.length,exposedData:true,notAnExecutableTradingBacktest:true}));}
console.log("ORB002_COVERAGE",JSON.stringify({candidateDates:dates.length,eligible,excluded}));
console.log("VALIDATION_STATUS",JSON.stringify({cacheOnly:true,noApi:true,noOrders:true,strategiesUnchanged:true,resultsDescriptiveOnly:true,allHistoricalDataExposed:true,freshHoldoutRequired:true,liveTradingApproved:false}));

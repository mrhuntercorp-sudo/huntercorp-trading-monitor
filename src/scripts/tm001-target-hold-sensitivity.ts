/** TM001 target/time sensitivity on exposed cache only. Never changes frozen P4 signals. */
import {CachedHistoricalDays} from "../research/historical-cache.js";
import {auditRthCoverage} from "../research/rth-coverage.js";
import {overnightBars} from "../research/session-features.js";
import {rthBars} from "../research/level-reclaim.js";
import {generateP4Signals} from "../research/p4-nq-signals.js";
import {newYorkClock} from "../market/time.js";
import {provisionalClosedDates,provisionalNqContract,isProvisionalRoll} from "./massive-nq-calendar-policy.js";
import type {MinuteBar} from "../market/types.js";

const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("NETWORK_DISABLED");}});
const iso=(t:number)=>new Date(t).toISOString().slice(0,10);
const ms=(d:string)=>Date.parse(d+"T00:00:00Z");
const dates:string[]=[];
for(let t=ms("2026-10-02");dates.length<30;t-=86400000){const d=iso(t),w=new Date(t).getUTCDay();if(w!==0&&w!==6&&!provisionalClosedDates.has(d))dates.push(d);}
dates.reverse();
const periods=[{name:"IN_SAMPLE_EXPOSED",dates},{name:"OOS1_EXPOSED_NOT_FRESH",dates:["2026-10-05","2026-10-06","2026-10-07","2026-10-08","2026-10-09"]}];
const targets=[10,15,20,30,40] as const;
const holds=[5,10,15,30] as const;
const loaded=new Map<string,MinuteBar[]>();
async function load(ticker:string,date:string){const key=ticker+"|"+date;if(!loaded.has(key))loaded.set(key,await cache.getDay({ticker,productCode:"NQ"},date));return loaded.get(key)!;}
const round=(n:number)=>Math.round(n*100)/100;
type Outcome={date:string;net:number;reason:string;ambiguous:boolean};
console.log("=== TM001 FROZEN-ENTRY TARGET AND HOLD SENSITIVITY ===");
console.log("CACHE_ONLY | ZERO_API | ZERO_SPEND | ZERO_ORDERS | EXPOSED_SAMPLES | NOT_OPTIMIZATION_APPROVAL");
console.log("BASELINE",JSON.stringify({stopPoints:10,targetPoints:40,maxHoldMinutes:30,costPoints:2,entry:"NEXT_BAR_OPEN",stopFirstOnAmbiguousBar:true}));
for(const period of periods){
 const outcomes=new Map<string,Outcome[]>();
 let eligible=0;const excluded:{date:string;reason:string}[]=[];
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
   const c=newYorkClock(s.entryTime);
   if(c.hour*60+c.minute>=660)continue;
   const sign=s.direction==="LONG"?1:-1;
   for(const targetPoints of targets)for(const holdMinutes of holds){
    const key=targetPoints+"|"+holdMinutes;
    const stop=s.entryPrice-sign*10,target=s.entryPrice+sign*targetPoints;
    const deadline=Math.min(s.entryTime+holdMinutes*60000,day.at(-1)!.timestampMs);
    let exit=s.entryPrice,exitReason="TIME",ambiguous=false;
    for(let j=i;j<day.length;j++){
     const b=day[j]!;
     if(b.timestampMs>=deadline){exit=b.open;break;}
     if(j===day.length-1){exit=b.close;exitReason="SESSION_END";break;}
     const stopHit=sign===1?b.low<=stop:b.high>=stop;
     const targetHit=sign===1?b.high>=target:b.low<=target;
     if(stopHit){ambiguous=targetHit;exit=sign===1?Math.min(stop,b.open):Math.max(stop,b.open);exitReason="STOP";break;}
     if(targetHit){exit=target;exitReason="TARGET";break;}
    }
    const result={date,net:round((exit-s.entryPrice)*sign-2),reason:exitReason,ambiguous};
    const arr=outcomes.get(key)??[];arr.push(result);outcomes.set(key,arr);
   }
  }
 }
 for(const targetPoints of targets)for(const holdMinutes of holds){
  const arr=outcomes.get(targetPoints+"|"+holdMinutes)??[];
  let equity=0,peak=0,dd=0;
  for(const t of arr){equity+=t.net;peak=Math.max(peak,equity);dd=Math.max(dd,peak-equity);}
  console.log("TARGET_HOLD_SUMMARY",JSON.stringify({period:period.name,targetPoints,holdMinutes,stopPoints:10,candidateDates:period.dates.length,eligible,excluded,trades:arr.length,targets:arr.filter(t=>t.reason==="TARGET").length,stops:arr.filter(t=>t.reason==="STOP").length,timeExits:arr.filter(t=>t.reason==="TIME").length,ambiguousStopFirstBars:arr.filter(t=>t.ambiguous).length,netPoints:round(equity),avgPoints:arr.length?round(equity/arr.length):null,maxClosedDrawdownPoints:round(dd),extra2PointsCostNet:round(equity-arr.length*2),extra4PointsCostNet:round(equity-arr.length*4),exposedNotFresh:true,notExecutionCertified:true}));
 }
}
console.log("VALIDATION_STATUS",JSON.stringify({frozenBaselineUnchanged:true,priorOosRejectionPreserved:true,allEvidenceExposed:true,needsFreshHoldout:true,minuteBarIntrabarSequenceUnknown:true,liveTradingApproved:false}));

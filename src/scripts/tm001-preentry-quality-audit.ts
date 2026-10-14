/** TM001: descriptive pre-entry quality features. No selection, tuning, orders or APIs. */
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
const loaded=new Map<string,MinuteBar[]>();
async function load(ticker:string,date:string){const key=ticker+"|"+date;if(!loaded.has(key))loaded.set(key,await cache.getDay({ticker,productCode:"NQ"},date));return loaded.get(key)!;}
const round=(n:number)=>Math.round(n*100)/100;
type RecordRow={date:string;net:number;result:string;signalRange:number;signalBody:number;signalBodyFraction:number;signalCloseLocation:number;priorFiveRange:number;priorFiveAvgRange:number;priorFiveDirectionalChange:number;gapAgainstSignal:number;entryOpenGap:number;signalMinute:string};
console.log("=== TM001 PRE-ENTRY SIGNAL QUALITY DIAGNOSTIC ===");
console.log("CACHE_ONLY | ZERO_API | ZERO_SPEND | ZERO_ORDERS | NO_FILTERS | ALL_SAMPLES_EXPOSED");
for(const period of periods){
 const rows:RecordRow[]=[];let eligible=0;const excluded:{date:string;reason:string}[]=[];
 for(const date of period.dates){
  const ticker=period.name==="OOS1_EXPOSED_NOT_FRESH"?"NQZ6":provisionalNqContract(date),prior=iso(ms(date)-86400000);
  const bars=[...await load(ticker,prior),...await load(ticker,date)].sort((a,b)=>a.timestampMs-b.timestampMs);
  const day=rthBars(bars,date),overnight=overnightBars(bars,date);
  let reason="";
  if(period.name==="IN_SAMPLE_EXPOSED"&&isProvisionalRoll(date))reason="UNVERIFIED_ROLL";
  else if(new Set(bars.map(b=>b.timestampMs)).size!==bars.length)reason="DUPLICATE_TIMESTAMPS";
  else if(auditRthCoverage(day,date,ticker).status!=="COMPLETE")reason="INCOMPLETE_RTH";
  else if(overnight.length!==930||overnight.some((b,i)=>i>0&&b.timestampMs-overnight[i-1]!.timestampMs!==60000))reason="INCOMPLETE_OVERNIGHT";
  if(reason){excluded.push({date,reason});continue;}
  eligible++;
  for(const s of generateP4Signals({bars:day,contractVerified:true,calendarVerified:true},"SESSION_TREND_PULLBACK_V1",10)){
   const i=day.findIndex(b=>b.timestampMs===s.entryTime);if(i<5)throw Error("MISSING_ENTRY_OR_HISTORY "+date);
   const c=newYorkClock(s.entryTime);if(c.hour*60+c.minute>=660)continue;
   const sign=s.direction==="LONG"?1:-1,signal=day[i-1]!,entry=day[i]!,priorFive=day.slice(i-6,i-1);
   const range=signal.high-signal.low,stop=s.stopPrice,target=s.targetPrice,deadline=Math.min(s.timeExitMs,day.at(-1)!.timestampMs);
   let exit=s.entryPrice,result="TIME";
   for(let j=i;j<day.length;j++){
    const b=day[j]!;
    if(b.timestampMs>=deadline){exit=b.open;break;}
    if(j===day.length-1){exit=b.close;result="SESSION_END";break;}
    const stopHit=sign===1?b.low<=stop:b.high>=stop,targetHit=sign===1?b.high>=target:b.low<=target;
    if(stopHit){exit=sign===1?Math.min(stop,b.open):Math.max(stop,b.open);result="STOP";break;}
    if(targetHit){exit=target;result="TARGET";break;}
   }
   const row:RecordRow={date,net:round((exit-s.entryPrice)*sign-2),result,signalRange:round(range),signalBody:round(Math.abs(signal.close-signal.open)),signalBodyFraction:range?round(Math.abs(signal.close-signal.open)/range):0,signalCloseLocation:range?round(sign*(signal.close-(signal.high+signal.low)/2)/range):0,priorFiveRange:round(Math.max(...priorFive.map(b=>b.high))-Math.min(...priorFive.map(b=>b.low))),priorFiveAvgRange:round(priorFive.reduce((v,b)=>v+b.high-b.low,0)/priorFive.length),priorFiveDirectionalChange:round(sign*(signal.close-priorFive[0]!.open)),gapAgainstSignal:round(-sign*(entry.open-signal.close)),entryOpenGap:round(entry.open-signal.close),signalMinute:String(c.hour).padStart(2,"0")+":"+String(c.minute-1).padStart(2,"0")};
   rows.push(row);console.log("PRE_ENTRY_TRADE",JSON.stringify({period:period.name,...row,featuresOnlyThroughSignalClose:true,entryOpenGapIsNextBarOpenNotSignalClose:true}));
  }
 }
 for(const result of ["TARGET","STOP"]){
  const group=rows.filter(r=>r.result===result);
  const avg=(k:keyof RecordRow)=>group.length?round(group.reduce((a,r)=>a+Number(r[k]),0)/group.length):null;
  console.log("QUALITY_GROUP",JSON.stringify({period:period.name,result,count:group.length,avgSignalRange:avg("signalRange"),avgSignalBodyFraction:avg("signalBodyFraction"),avgSignalCloseLocation:avg("signalCloseLocation"),avgPriorFiveRange:avg("priorFiveRange"),avgPriorFiveAvgRange:avg("priorFiveAvgRange"),avgPriorFiveDirectionalChange:avg("priorFiveDirectionalChange"),avgGapAgainstSignal:avg("gapAgainstSignal"),descriptiveOnly:true}));
 }
 console.log("QUALITY_PERIOD_SUMMARY",JSON.stringify({period:period.name,candidateDates:period.dates.length,eligible,excluded,trades:rows.length,targets:rows.filter(r=>r.result==="TARGET").length,stops:rows.filter(r=>r.result==="STOP").length,netPoints:round(rows.reduce((a,r)=>a+r.net,0)),allExposed:true}));
}
console.log("VALIDATION_STATUS",JSON.stringify({frozenStrategyUnchanged:true,featuresNotUsedAsFilters:true,octoberNotFresh:true,selectionRequiresFreshHoldout:true,liveTradingApproved:false}));

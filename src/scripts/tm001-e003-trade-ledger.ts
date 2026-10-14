/** E003: independent, read-only P4/ORB5 session ledger. Historical exposed sample only. */
import {CachedHistoricalDays} from "../research/historical-cache.js";
import {auditRthCoverage} from "../research/rth-coverage.js";
import {overnightBars} from "../research/session-features.js";
import {rthBars} from "../research/level-reclaim.js";
import {generateP4Signals} from "../research/p4-nq-signals.js";
import {backtestConservativeOrb} from "../research/conservative-orb.js";
import {newYorkClock} from "../market/time.js";
import {provisionalClosedDates,provisionalNqContract,isProvisionalRoll} from "./massive-nq-calendar-policy.js";
import type {MinuteBar} from "../market/types.js";

const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("NETWORK_DISABLED_CACHE_ONLY");}});
const iso=(t:number)=>new Date(t).toISOString().slice(0,10);
const ms=(s:string)=>Date.parse(s+"T00:00:00Z");
const dates:string[]=[];
for(let t=ms("2026-10-02");dates.length<30;t-=86400000){
 const d=iso(t),w=new Date(t).getUTCDay();
 if(w!==0&&w!==6&&!provisionalClosedDates.has(d))dates.push(d);
}
dates.reverse();
const memo=new Map<string,MinuteBar[]>();
async function load(ticker:string,date:string){
 const k=ticker+"|"+date;
 if(!memo.has(k))memo.set(k,await cache.getDay({ticker,productCode:"NQ"},date));
 return memo.get(k)!;
}
const minutes=(timestampMs:number)=>{
 const c=newYorkClock(timestampMs);return c.hour*60+c.minute;
};
const round=(n:number)=>Math.round(n*100)/100;
type Row={
 date:string;strategy:"P4"|"ORB5";status:"TRADE"|"NO_SIGNAL"|"OUTSIDE_ENTRY_WINDOW";
 direction?:string;signalTimeUtc?:string;entryTimeUtc?:string;entry?:number;
 stop?:number;target?:number;exitTimeUtc?:string;exit?:number;
 exitReason?:string;netPoints?:number;ambiguous?:boolean;gapThroughStop?:boolean;
 note?:string;
};
const rows:Row[]=[];
const excluded:{date:string;reason:string}[]=[];
let eligible=0;
console.log("E003_CONTRACT",JSON.stringify({
 sample:"EXPOSED_IN_SAMPLE_30_WEEKDAYS_ENDING_2026_10_02",
 window:"ENTRY_BEFORE_11_ET",baseCostPoints:2,
 network:false,orders:false,optimization:false,simulationOnly:true
}));
for(const date of dates){
 const ticker=provisionalNqContract(date),prior=iso(ms(date)-86400000);
 // Preserve native-audit load behavior exactly; fail closed on missing cache.
 const bars=[...await load(ticker,prior),...await load(ticker,date)].sort((a,b)=>a.timestampMs-b.timestampMs);
 const day=rthBars(bars,date),overnight=overnightBars(bars,date);
 if(isProvisionalRoll(date)||auditRthCoverage(day,date,ticker).status!=="COMPLETE"||
  overnight.length!==930||overnight.some((b,i)=>i>0&&b.timestampMs-overnight[i-1]!.timestampMs!==60000)||
  new Set(bars.map(b=>b.timestampMs)).size!==bars.length){
  excluded.push({date,reason:"NATIVE_COVERAGE_OR_ROLL_EXCLUSION"});continue;
 }
 eligible++;
 const orb=backtestConservativeOrb(day,{openingRangeMinutes:5,stopPoints:40,targetPoints:80,
  contracts:1,friction:{roundTripCommissionUsd:40,slippageTicksPerSide:0}});
 if(orb.excluded.length)throw Error("ORB_EXCLUDED "+date+" "+JSON.stringify(orb.excluded));
 const ot=orb.trades[0];
 if(!ot)rows.push({date,strategy:"ORB5",status:"NO_SIGNAL"});
 else if(minutes(ot.entryTimestampMs)>=660)
  rows.push({date,strategy:"ORB5",status:"OUTSIDE_ENTRY_WINDOW",entryTimeUtc:new Date(ot.entryTimestampMs).toISOString()});
 else {
  const entryIndex=day.findIndex(b=>b.timestampMs===ot.entryTimestampMs);
  if(entryIndex<1)throw Error("ORB_ENTRY_INDEX "+date);
  // Reconstruct the first bar on which the frozen ORB exit is reached, without altering the simulator.
  const sign=ot.direction==="LONG"?1:-1;
  const stop=ot.entry-sign*40,target=ot.entry+sign*80;
  let exitIndex=day.length-1;
  if(ot.exitReason!=="SESSION_END"){
   exitIndex=-1;
   for(let j=entryIndex;j<day.length;j++){
    const b=day[j]!;
    const stopHit=sign===1?b.low<=stop:b.high>=stop;
    const targetHit=sign===1?b.high>=target:b.low<=target;
    if(stopHit||targetHit){exitIndex=j;break;}
   }
   if(exitIndex<0)throw Error("ORB_EXIT_NOT_FOUND "+date);
   const b=day[exitIndex]!;
   const stopHit=sign===1?b.low<=stop:b.high>=stop;
   if((stopHit?"STOP":"TARGET")!==ot.exitReason)throw Error("ORB_EXIT_REASON_MISMATCH "+date);
  }
  rows.push({date,strategy:"ORB5",status:"TRADE",direction:ot.direction,
   signalTimeUtc:new Date(day[entryIndex-1]!.timestampMs).toISOString(),
   entryTimeUtc:new Date(ot.entryTimestampMs).toISOString(),entry:ot.entry,stop,target,
   exitTimeUtc:new Date(day[exitIndex]!.timestampMs).toISOString(),exit:ot.exit,
   exitReason:ot.exitReason,netPoints:round(ot.netPnlUsd/20),
   ambiguous:ot.ambiguousExit,gapThroughStop:ot.gapThroughStop,
   note:"Exit time reconstructed from first matching minute bar; not a fill timestamp"});
 }
 const signals=generateP4Signals({bars:day,contractVerified:true,calendarVerified:true},"SESSION_TREND_PULLBACK_V1",10);
 const s=signals[0];
 if(!s)rows.push({date,strategy:"P4",status:"NO_SIGNAL"});
 else if(minutes(s.entryTime)>=660)
  rows.push({date,strategy:"P4",status:"OUTSIDE_ENTRY_WINDOW",signalTimeUtc:new Date(s.signalTime).toISOString(),entryTimeUtc:new Date(s.entryTime).toISOString()});
 else {
  const entryIndex=day.findIndex(b=>b.timestampMs===s.entryTime);
  if(entryIndex<0)throw Error("P4_ENTRY_MISSING "+date);
  const sign=s.direction==="LONG"?1:-1;
  let exit=s.entryPrice,reason="TIME",exitIndex=entryIndex,ambiguous=false;
  const deadline=Math.min(s.timeExitMs,day.at(-1)!.timestampMs);
  for(let j=entryIndex;j<day.length;j++){
   const b=day[j]!;
   if(b.timestampMs>=deadline){exit=b.open;exitIndex=j;break;}
   if(j===day.length-1){exit=b.close;exitIndex=j;break;}
   const stopHit=sign===1?b.low<=s.stopPrice:b.high>=s.stopPrice;
   const targetHit=sign===1?b.high>=s.targetPrice:b.low<=s.targetPrice;
   if(stopHit){ambiguous=targetHit;exit=sign===1?Math.min(s.stopPrice,b.open):Math.max(s.stopPrice,b.open);reason="STOP";exitIndex=j;break;}
   if(targetHit){exit=s.targetPrice;reason="TARGET";exitIndex=j;break;}
  }
  rows.push({date,strategy:"P4",status:"TRADE",direction:s.direction,
   signalTimeUtc:new Date(s.signalTime).toISOString(),
   entryTimeUtc:new Date(s.entryTime).toISOString(),entry:s.entryPrice,
   stop:s.stopPrice,target:s.targetPrice,
   exitTimeUtc:new Date(day[exitIndex]!.timestampMs).toISOString(),
   exit,exitReason:reason,netPoints:round((exit-s.entryPrice)*sign-2),
   ambiguous,note:"Minute OHLC simulation; next-open fills and costs assumed"});
 }
}
for(const row of rows)console.log("E003_EVENT",JSON.stringify(row));
const summary=(strategy:"P4"|"ORB5")=>{
 const a=rows.filter(r=>r.strategy===strategy),t=a.filter(r=>r.status==="TRADE");
 return {strategy,eligibleDays:a.length,trades:t.length,noSignal:a.filter(r=>r.status==="NO_SIGNAL").length,
  outsideWindow:a.filter(r=>r.status==="OUTSIDE_ENTRY_WINDOW").length,
  netPoints:round(t.reduce((s,r)=>s+r.netPoints!,0)),
  stops:t.filter(r=>r.exitReason==="STOP").length,targets:t.filter(r=>r.exitReason==="TARGET").length,
  timeExits:t.filter(r=>r.exitReason==="TIME"||r.exitReason==="SESSION_END").length};
};
const p4=summary("P4"),orb=summary("ORB5");
const passed=eligible===28&&excluded.length===2&&p4.trades===19&&p4.netPoints===222&&
 orb.trades===28&&orb.netPoints===144;
console.log("E003_RECONCILIATION",JSON.stringify({eligible,excluded,p4,orb,
 expected:{eligible:28,excluded:2,p4Trades:19,p4NetPoints:222,orbTrades:28,orbNetPoints:144},
 status:passed?"GREEN":"RED",noStrategyApproved:true}));
if(!passed)throw Error("E003_RECONCILIATION_FAILED_STOP");

// Read-only access for downstream audits; E003 reconciliation runs before import completes.
export const e003Rows: readonly Row[]=rows;
export const e003Excluded: readonly {date:string;reason:string}[]=excluded;

/** Frozen P4 trend reconciliation: prior in-sample window versus already-viewed OOS1. */
import {CachedHistoricalDays} from "../research/historical-cache.js";
import {auditRthCoverage} from "../research/rth-coverage.js";
import {overnightBars} from "../research/session-features.js";
import {rthBars} from "../research/level-reclaim.js";
import {generateP4Signals} from "../research/p4-nq-signals.js";
import {newYorkClock} from "../market/time.js";
import {provisionalClosedDates,provisionalNqContract,isProvisionalRoll} from "./massive-nq-calendar-policy.js";
import type {MinuteBar} from "../market/types.js";
const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("NETWORK_DISABLED");}});
const ms=(s:string)=>Date.parse(s+"T00:00:00Z"),iso=(t:number)=>new Date(t).toISOString().slice(0,10);
const insample:string[]=[];for(let t=ms("2026-10-02");insample.length<30;t-=86400000){const d=iso(t),w=new Date(t).getUTCDay();if(w!==0&&w!==6&&!provisionalClosedDates.has(d))insample.push(d);}insample.reverse();
const oos=["2026-10-05","2026-10-06","2026-10-07","2026-10-08","2026-10-09"];
const loaded=new Map<string,MinuteBar[]>();
async function load(ticker:string,date:string){const k=ticker+"|"+date;if(!loaded.has(k))loaded.set(k,await cache.getDay({ticker,productCode:"NQ"},date));return loaded.get(k)!;}
const clock=(t:number)=>{const c=newYorkClock(t);return c.hour*60+c.minute;};
const fmt=(t:number)=>{const m=clock(t);return String(Math.floor(m/60)).padStart(2,"0")+":"+String(m%60).padStart(2,"0");};
const round=(n:number)=>Math.round(n*100)/100;
type Trade={date:string;direction:string;entryTime:string;exitTime:string;entry:number;stop:number;target:number;exit:number;reason:string;netPoints:number;worstBarAdversePoints:number;stopGapPoints:number;entryBarExit:boolean;ambiguous:boolean};
const buckets=new Map<string,Trade[]>([["IN_SAMPLE_OPEN",[]],["OOS1_OPEN",[]],["OOS1_ALL_RTH",[]]]);
let excludedIn=0,excludedOos=0,eligibleIn=0,eligibleOos=0,oosOutsideWindow=0;
console.log("=== TM001 FROZEN TREND VALIDATION RECONCILIATION ===");
console.log("CACHE_ONLY | ZERO_API | ZERO_ORDERS | ZERO_OPTIMIZATION | OOS1_ALREADY_VIEWED_NOT_FRESH");
console.log("LOCKED_RULES",JSON.stringify({strategy:"SESSION_TREND_PULLBACK_V1",stopPoints:10,targetPoints:40,deadlineMinutes:30,entry:"NEXT_BAR_OPEN",maxTradesPerDay:1,baseRoundTripCostPoints:2,windows:["09:30-11:00","ALL_RTH"],intrabarStopFirst:true,accountRiskNotReplayed:true}));
for(const [group,dates] of [["IN_SAMPLE",insample],["OOS1",oos]] as const){
 for(const date of dates){
  const ticker=group==="OOS1"?"NQZ6":provisionalNqContract(date),prior=iso(ms(date)-86400000);
  const bars=[...await load(ticker,prior),...await load(ticker,date)].sort((a,b)=>a.timestampMs-b.timestampMs);
  const day=rthBars(bars,date),overnight=overnightBars(bars,date);
  const valid=!isProvisionalRoll(date)&&auditRthCoverage(day,date,ticker).status==="COMPLETE"&&overnight.length===930&&overnight.every((b,i)=>i===0||b.timestampMs-overnight[i-1]!.timestampMs===60000)&&new Set(bars.map(b=>b.timestampMs)).size===bars.length;
  if(!valid){if(group==="IN_SAMPLE")excludedIn++;else excludedOos++;console.log("TREND_EXCLUDED",JSON.stringify({group,date}));continue;}
  if(group==="IN_SAMPLE")eligibleIn++;else eligibleOos++;
  const signals=generateP4Signals({bars:day,contractVerified:true,calendarVerified:true},"SESSION_TREND_PULLBACK_V1",10);
  if(!signals.length)continue;
  const s=signals[0]!,entryIndex=day.findIndex(b=>b.timestampMs===s.entryTime);
  if(entryIndex<0)throw Error("ENTRY_NOT_FOUND");
  const sign=s.direction==="LONG"?1:-1,deadline=Math.min(s.timeExitMs,day.at(-1)!.timestampMs);
  let exit=s.entryPrice,reason="TIME_EXIT",exitIndex=entryIndex,ambiguous=false,worstAdverse=0,stopGap=0;
  for(let j=entryIndex;j<day.length;j++){
   const b=day[j]!;
   if(b.timestampMs>=deadline){exit=b.open;exitIndex=j;break;}
   if(j===day.length-1){exit=b.close;exitIndex=j;reason="SESSION_END";break;}
   const adverse=(s.entryPrice-(sign===1?b.low:b.high))*sign;
   worstAdverse=Math.max(worstAdverse,adverse);
   const stopHit=sign===1?b.low<=s.stopPrice:b.high>=s.stopPrice,targetHit=sign===1?b.high>=s.targetPrice:b.low<=s.targetPrice;
   if(stopHit){ambiguous=targetHit;exit=sign===1?Math.min(s.stopPrice,b.open):Math.max(s.stopPrice,b.open);stopGap=Math.max(0,(s.entryPrice-exit)*sign-10);exitIndex=j;reason="STOP";break;}
   if(targetHit){exit=s.targetPrice;exitIndex=j;reason="TARGET";break;}
  }
  const t:Trade={date,direction:s.direction,entryTime:fmt(s.entryTime),exitTime:fmt(day[exitIndex]!.timestampMs),entry:s.entryPrice,stop:s.stopPrice,target:s.targetPrice,exit,reason,netPoints:round((exit-s.entryPrice)*sign-2),worstBarAdversePoints:round(worstAdverse),stopGapPoints:round(stopGap),entryBarExit:entryIndex===exitIndex,ambiguous};
  const open=clock(s.entryTime)<660;
  if(group==="IN_SAMPLE"){if(open)buckets.get("IN_SAMPLE_OPEN")!.push(t);}
  else {buckets.get("OOS1_ALL_RTH")!.push(t);if(open)buckets.get("OOS1_OPEN")!.push(t);else oosOutsideWindow++;}
  console.log("TREND_TRADE",JSON.stringify({group,openingEntry:open,...t}));
 }
}
for(const [group,a] of buckets){
 const net=a.reduce((s,t)=>s+t.netPoints,0);let equity=0,peak=0,dd=0;
 for(const t of a){equity+=t.netPoints;peak=Math.max(peak,equity);dd=Math.max(dd,peak-equity);}
 console.log("TREND_RECONCILIATION",JSON.stringify({group,trades:a.length,wins:a.filter(t=>t.netPoints>0).length,losses:a.filter(t=>t.netPoints<0).length,stops:a.filter(t=>t.reason==="STOP").length,targets:a.filter(t=>t.reason==="TARGET").length,timeExits:a.filter(t=>t.reason==="TIME_EXIT").length,netPoints:round(net),averagePoints:a.length?round(net/a.length):null,drawdownPoints:round(dd),worstTradePoints:a.length?Math.min(...a.map(t=>t.netPoints)):null,bestDayRemovedPoints:a.length?round(net-Math.max(...a.map(t=>t.netPoints))):null,ambiguous:a.filter(t=>t.ambiguous).length,entryBarExits:a.filter(t=>t.entryBarExit).length,exitsAtOrAfter11:a.filter(t=>Number(t.exitTime.slice(0,2))*60+Number(t.exitTime.slice(3))>=660).length,costStress:[0,2,4].map(extra=>({totalCostPoints:2+extra,netPoints:round(net-extra*a.length)}))}));
}
console.log("TREND_RECONCILIATION_COMPLETE",JSON.stringify({eligibleIn,excludedIn,eligibleOos,excludedOos,oosOutsideWindow,previousOosRiskScorecardsNotReplayed:true,notFreshOos:true,doNotOverturnPriorRejection:true,liveApproval:false}));

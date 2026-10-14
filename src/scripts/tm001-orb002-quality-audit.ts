/** ORB002 breakout diagnostics: exposed cached data, descriptive only. */
import {CachedHistoricalDays} from "../research/historical-cache.js";
import {detectOvernightBreakout,type OvernightVariant} from "../research/overnight-breakout-signals.js";
import {rthBars} from "../research/level-reclaim.js";
import {auditRthCoverage} from "../research/rth-coverage.js";
import {provisionalClosedDates,provisionalNqContract,isProvisionalRoll} from "./massive-nq-calendar-policy.js";
import {newYorkClock} from "../market/time.js";
import type {MinuteBar} from "../market/types.js";
const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("NETWORK_DISABLED_CACHE_ONLY");}});
const iso=(t:number)=>new Date(t).toISOString().slice(0,10),ms=(d:string)=>Date.parse(d+"T00:00:00Z");
const dates:string[]=[];
for(let t=ms("2026-10-09");dates.length<35;t-=86400000){const d=iso(t),w=new Date(t).getUTCDay();if(w!==0&&w!==6&&!provisionalClosedDates.has(d))dates.push(d);}
dates.reverse();
const variants:OvernightVariant[]=["ORB002_LONDON","ORB002_FULL_OVERNIGHT"];
type Signal=NonNullable<ReturnType<typeof detectOvernightBreakout>>;
type Row={date:string;variant:OvernightVariant;direction:string;entryTime:string;minutesAfterOpen:number;entryPrice:number;mfe30:number|null;mae30:number|null;mfe60:number|null;mae60:number|null;closeBackInside30:boolean|null;closeBackInside60:boolean|null;firstCloseBackInsideMinutes:number|null};
const rows:Row[]=[];const exclusions:{date:string;reason:string}[]=[];
let eligible=0,paired=0,agree=0,disagree=0,oneOnly=0,neither=0;
const round=(n:number)=>Math.round(n*100)/100;
const mean=(xs:number[])=>xs.length?round(xs.reduce((a,b)=>a+b,0)/xs.length):null;
const signed=(s:Signal,x:number,entry:number)=>(s.direction==="LONG"?1:-1)*(x-entry);
const bucket=(m:number)=>m<60?"09:45-10:29":m<120?"10:30-11:29":"11:30+";
console.log("=== TM001 ORB002 BREAKOUT QUALITY AUDIT ===");
console.log("CACHE_ONLY | ZERO_API | ZERO_SPEND | ZERO_ORDERS | NO_OPTIMIZATION | ALL_EXPOSED");
for(const date of dates){
 const ticker=provisionalNqContract(date),previous=iso(ms(date)-86400000);
 if(isProvisionalRoll(date)){exclusions.push({date,reason:"UNVERIFIED_ROLL"});continue;}
 let bars:MinuteBar[];
 try{bars=[...await cache.getDay({ticker,productCode:"NQ"},previous),...await cache.getDay({ticker,productCode:"NQ"},date)].sort((a,b)=>a.timestampMs-b.timestampMs);}
 catch(e){exclusions.push({date,reason:"CACHE_UNAVAILABLE:"+String(e instanceof Error?e.message:e)});continue;}
 const rth=rthBars(bars,date);
 if(auditRthCoverage(rth,date,ticker).status!=="COMPLETE"){exclusions.push({date,reason:"INCOMPLETE_RTH"});continue;}
 const signals:Partial<Record<OvernightVariant,Signal|null>>={};
 try{for(const v of variants)signals[v]=detectOvernightBreakout(bars,date,v);}
 catch(e){exclusions.push({date,reason:String(e instanceof Error?e.message:e)});continue;}
 eligible++;
 const l=signals.ORB002_LONDON??null,o=signals.ORB002_FULL_OVERNIGHT??null;
 if(l&&o){paired++;if(l.direction===o.direction)agree++;else disagree++;}
 else if(l||o)oneOnly++;else neither++;
 console.log("ORB002_PAIR",JSON.stringify({date,london:l?.direction??null,fullOvernight:o?.direction??null,sameDirection:!!l&&!!o&&l.direction===o.direction}));
 for(const variant of variants){
  const s=signals[variant];if(!s)continue;
  const index=rth.findIndex(b=>b.timestampMs===s.earliestEntryMs);
  if(index<0){console.log("ORB002_UNFILLED",JSON.stringify({date,variant,reason:"NO_NEXT_RTH_BAR"}));continue;}
  const entry=rth[index]!.open;
  // 30/60 minute windows include exactly N one-minute bars beginning at assumed entry.
  // MFE/MAE are independent extremes; their chronological order is not inferred.
  const metrics=(n:number)=>{
   const xs=rth.slice(index,index+n);
   if(xs.length!==n)return null;
   const favorable=Math.max(0,...xs.map(b=>signed(s,s.direction==="LONG"?b.high:b.low,entry)));
   const adverse=Math.max(0,...xs.map(b=>-signed(s,s.direction==="LONG"?b.low:b.high,entry)));
   const closes=xs.filter(b=>b.timestampMs>=s.earliestEntryMs&&b.timestampMs%900000===840000);
   const back=closes.some(b=>b.close<=s.overnightHigh&&b.close>=s.overnightLow);
   return {mfe:round(favorable),mae:round(adverse),back};
  };
  const m30=metrics(30),m60=metrics(60);
  // A 15-minute bar ending at :00/:15/:30/:45 has last minute timestamp modulo 15m = 14m.
  const all=rth.slice(index);
  const first=all.find(b=>b.timestampMs%900000===840000&&b.close<=s.overnightHigh&&b.close>=s.overnightLow);
  const clock=newYorkClock(s.earliestEntryMs),minute=clock.hour*60+clock.minute-570;
  const row:Row={date,variant,direction:s.direction,entryTime:`${String(clock.hour).padStart(2,"0")}:${String(clock.minute).padStart(2,"0")}`,minutesAfterOpen:minute,entryPrice:entry,mfe30:m30?.mfe??null,mae30:m30?.mae??null,mfe60:m60?.mfe??null,mae60:m60?.mae??null,closeBackInside30:m30?.back??null,closeBackInside60:m60?.back??null,firstCloseBackInsideMinutes:first?(first.timestampMs+60000-s.earliestEntryMs)/60000:null};
  rows.push(row);console.log("ORB002_QUALITY_DAY",JSON.stringify(row));
 }
}
for(const variant of variants){
 const xs=rows.filter(r=>r.variant===variant);
 const summary=(ys:Row[])=>({signals:ys.length,complete30:ys.filter(r=>r.mfe30!==null).length,complete60:ys.filter(r=>r.mfe60!==null).length,meanMfe30:mean(ys.flatMap(r=>r.mfe30===null?[]:[r.mfe30])),meanMae30:mean(ys.flatMap(r=>r.mae30===null?[]:[r.mae30])),meanMfe60:mean(ys.flatMap(r=>r.mfe60===null?[]:[r.mfe60])),meanMae60:mean(ys.flatMap(r=>r.mae60===null?[]:[r.mae60])),inside30:ys.filter(r=>r.closeBackInside30===true).length,inside60:ys.filter(r=>r.closeBackInside60===true).length,inside30Denominator:ys.filter(r=>r.closeBackInside30!==null).length,inside60Denominator:ys.filter(r=>r.closeBackInside60!==null).length});
 console.log("ORB002_QUALITY_SUMMARY",JSON.stringify({variant,...summary(xs)}));
 for(const label of ["09:45-10:29","10:30-11:29","11:30+"]){const ys=xs.filter(r=>bucket(r.minutesAfterOpen)===label);console.log("ORB002_TIME_BUCKET",JSON.stringify({variant,bucket:label,...summary(ys)}));}
}
console.log("ORB002_DIRECTION_AGREEMENT",JSON.stringify({bothSignal:paired,sameDirection:agree,oppositeDirection:disagree,oneOnly,neither}));
console.log("ORB002_QUALITY_COVERAGE",JSON.stringify({candidateDates:dates.length,eligible,excluded:exclusions}));
console.log("VALIDATION_STATUS",JSON.stringify({descriptiveOnly:true,independentMfeMaeNotAPathwiseFill:true,closeBackInsideRequiresCompleted15m:true,noOrders:true,noApi:true,noOptimization:true,allExposed:true,freshHoldoutRequired:true,liveTradingApproved:false}));

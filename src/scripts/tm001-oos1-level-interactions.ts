/** Descriptive level-interaction research; no strategy selection, trades, or future-aware levels. */
import {CachedHistoricalDays} from "../research/historical-cache.js";
import {auditRthCoverage} from "../research/rth-coverage.js";
import {overnightBars} from "../research/session-features.js";
import {newYorkClock} from "../market/time.js";
import type {MinuteBar} from "../market/types.js";

const dates=["2026-10-05","2026-10-06","2026-10-07","2026-10-08","2026-10-09"];
const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("NETWORK_DISABLED");}});
const contract={ticker:"NQZ6",productCode:"NQ" as const};
const all:MinuteBar[]=[];
for(const date of ["2026-10-04",...dates])all.push(...await cache.getDay(contract,date));
all.sort((a,b)=>a.timestampMs-b.timestampMs);
const clock=(b:MinuteBar)=>newYorkClock(b.timestampMs);
const minute=(b:MinuteBar)=>{const c=clock(b);return c.hour*60+c.minute;};
const rth=(date:string)=>all.filter(b=>clock(b).date===date&&minute(b)>=570&&minute(b)<960);
const round=(n:number)=>Math.round(n*100)/100;
const time=(b:MinuteBar)=>{const c=clock(b);return String(c.hour).padStart(2,"0")+":"+String(c.minute).padStart(2,"0");};
console.log("=== TM001 OOS1 LEVEL INTERACTION DIAGNOSTICS ===");
console.log("DESCRIPTIVE_ONLY | HOLDOUT_ALREADY_VIEWED | ZERO_API | ZERO_TRADES | NO_NEW_STRATEGY");
for(const date of dates){
 const day=rth(date),quality=auditRthCoverage(day,date,contract.ticker);
 if(quality.status!=="COMPLETE")throw Error("INCOMPLETE_RTH "+date);
 const overnight=overnightBars(all,date);
 if(overnight.length!==930||overnight.some((b,i)=>i>0&&b.timestampMs-overnight[i-1]!.timestampMs!==60000))throw Error("INCOMPLETE_OVERNIGHT "+date);
 const levels=[
  {name:"OVERNIGHT_HIGH",price:Math.max(...overnight.map(b=>b.high)),side:"HIGH"},
  {name:"OVERNIGHT_LOW",price:Math.min(...overnight.map(b=>b.low)),side:"LOW"},
  {name:"ORB_5_HIGH",price:Math.max(...day.slice(0,5).map(b=>b.high)),side:"HIGH"},
  {name:"ORB_5_LOW",price:Math.min(...day.slice(0,5).map(b=>b.low)),side:"LOW"},
  {name:"ORB_15_HIGH",price:Math.max(...day.slice(0,15).map(b=>b.high)),side:"HIGH"},
  {name:"ORB_15_LOW",price:Math.min(...day.slice(0,15).map(b=>b.low)),side:"LOW"},
 ] as const;
 console.log("LEVEL_DAY",JSON.stringify({date,overnightWidthPoints:round(levels[0].price-levels[1].price),opening5WidthPoints:round(levels[2].price-levels[3].price),opening15WidthPoints:round(levels[4].price-levels[5].price),opening5Volume:day.slice(0,5).reduce((s,b)=>s+b.volume,0),opening15Volume:day.slice(0,15).reduce((s,b)=>s+b.volume,0)}));
 for(const level of levels){
  const start=level.name.startsWith("ORB_5")?5:level.name.startsWith("ORB_15")?15:0;
  const scan=day.slice(start);
  const firstTouch=scan.findIndex(b=>b.low<=level.price&&b.high>=level.price);
  const firstCloseBeyond=scan.findIndex(b=>level.side==="HIGH"?b.close>level.price:b.close<level.price);
  const firstCloseBackInside=firstCloseBeyond<0?-1:scan.findIndex((b,i)=>i>firstCloseBeyond&&(level.side==="HIGH"?b.close<=level.price:b.close>=level.price));
  const trigger=firstCloseBeyond<0?null:scan[firstCloseBeyond]!;
  const before=firstCloseBeyond>0?scan[firstCloseBeyond-1]!:null;
  console.log("LEVEL_INTERACTION",JSON.stringify({date,level:level.name,price:level.price,availableFromEt:start===0?"09:30":start===5?"09:35":"09:45",firstTouchEt:firstTouch<0?null:time(scan[firstTouch]!),firstCloseBeyondEt:trigger?time(trigger):null,firstReentryEt:firstCloseBackInside<0?null:time(scan[firstCloseBackInside]!),minutesToReentry:firstCloseBackInside<0?null:firstCloseBackInside-firstCloseBeyond,priorCloseDistancePoints:before?round(Math.abs(before.close-level.price)):null,description:"First close beyond then first close back inside is descriptive, not an executable strategy; future reentry never used to issue earlier signals"}));
 }
}
console.log("LEVEL_DIAGNOSTICS_COMPLETE | LEVELS_KNOWN_BEFORE_INTERACTION | NO_PERFORMANCE_CLAIMS");

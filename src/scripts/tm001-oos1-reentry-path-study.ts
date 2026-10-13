/** First-close-reentry event study. Descriptive only, not a trade or optimized strategy. */
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
const minutes=(b:MinuteBar)=>{const c=clock(b);return c.hour*60+c.minute;};
const time=(b:MinuteBar)=>{const c=clock(b);return String(c.hour).padStart(2,"0")+":"+String(c.minute).padStart(2,"0");};
const round=(n:number)=>Math.round(n*100)/100;
console.log("=== TM001 REENTRY PATH EVENT STUDY ===");
console.log("EXPLORATORY | HOLDOUT_ALREADY_VIEWED | NO_TRADE_SIMULATION | NO_API | NO_WRITES");
for(const date of dates){
 const day=all.filter(b=>clock(b).date===date&&minutes(b)>=570&&minutes(b)<960);
 if(auditRthCoverage(day,date,"NQZ6").status!=="COMPLETE")throw Error("BAD_RTH "+date);
 const overnight=overnightBars(all,date);
 if(overnight.length!==930)throw Error("BAD_OVERNIGHT "+date);
 const levels=[
  {name:"OVERNIGHT_HIGH",price:Math.max(...overnight.map(b=>b.high)),high:true,start:0},
  {name:"OVERNIGHT_LOW",price:Math.min(...overnight.map(b=>b.low)),high:false,start:0},
  {name:"ORB_5_HIGH",price:Math.max(...day.slice(0,5).map(b=>b.high)),high:true,start:5},
  {name:"ORB_5_LOW",price:Math.min(...day.slice(0,5).map(b=>b.low)),high:false,start:5},
  {name:"ORB_15_HIGH",price:Math.max(...day.slice(0,15).map(b=>b.high)),high:true,start:15},
  {name:"ORB_15_LOW",price:Math.min(...day.slice(0,15).map(b=>b.low)),high:false,start:15},
 ];
 for(const l of levels){
  const scan=day.slice(l.start);
  const broken=scan.findIndex(b=>l.high?b.close>l.price:b.close<l.price);
  if(broken<0)continue;
  const reentry=scan.findIndex((b,i)=>i>broken&&(l.high?b.close<=l.price:b.close>=l.price));
  if(reentry<0)continue;
  const event=scan[reentry]!;
  const direction=l.high?-1:1;
  const future=scan.slice(reentry+1,reentry+11);
  const maxFavorable=future.length?Math.max(0,...future.map(b=>direction===1?b.high-event.close:event.close-b.low)):null;
  const maxAdverse=future.length?Math.max(0,...future.map(b=>direction===1?event.close-b.low:b.high-event.close)):null;
  const close10=future.length===10?round(direction*(future[9]!.close-event.close)):null;
  console.log("REENTRY_EVENT",JSON.stringify({date,level:l.name,price:l.price,breakEt:time(scan[broken]!),reentryEt:time(event),reentryClose:event.close,hypotheticalReversalDirection:direction===1?"LONG":"SHORT",availableForwardBars:future.length,next10MinuteMaxFavorablePoints:maxFavorable===null?null:round(maxFavorable),next10MinuteMaxAdversePoints:maxAdverse===null?null:round(maxAdverse),next10MinuteCloseMovePoints:close10,notes:"Forward path measured AFTER reentry close; not a fill assumption, trade or signal approval"}));
 }
}
console.log("REENTRY_PATH_COMPLETE | NO_TRADING_CLAIMS");

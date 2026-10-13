/** Historical first wick-rejection census. Descriptive only, no fills or optimization. */
import {CachedHistoricalDays} from "../research/historical-cache.js";
import {auditRthCoverage} from "../research/rth-coverage.js";
import {overnightBars} from "../research/session-features.js";
import {knownLevels,rthBars} from "../research/level-reclaim.js";
import {firstWickRejection} from "../research/wick-rejection.js";
import {provisionalClosedDates,provisionalNqContract,isProvisionalRoll} from "./massive-nq-calendar-policy.js";
const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("NETWORK_DISABLED");}});
const ms=(s:string)=>Date.parse(s+"T00:00:00Z"),iso=(t:number)=>new Date(t).toISOString().slice(0,10);
const dates:string[]=[];for(let t=ms("2026-10-02");dates.length<30;t-=86400000){const d=iso(t),w=new Date(t).getUTCDay();if(w!==0&&w!==6&&!provisionalClosedDates.has(d))dates.push(d);}dates.reverse();
const loaded=new Map<string,Awaited<ReturnType<typeof cache.getDay>>>();
async function load(ticker:string,date:string){const k=ticker+"|"+date;if(!loaded.has(k))loaded.set(k,await cache.getDay({ticker,productCode:"NQ"},date));return loaded.get(k)!;}
type Row={date:string;kind:string;direction:string;depth:number;closeInside:number;forward:number|null;entryToTenClose:number|null};
const rows:Row[]=[];let eligible=0,excluded=0,raw=0;
const median=(xs:number[])=>{if(!xs.length)return null;const a=[...xs].sort((x,y)=>x-y);return Math.round((a[Math.floor((a.length-1)/2)]!+a[Math.floor(a.length/2)]!)*50)/100;};
console.log("=== TM001 FIRST WICK REJECTION HISTORICAL CENSUS ===");
console.log("IN_SAMPLE | CACHE_ONLY | ZERO_API | ZERO_TRADES | NO_PNL | NO_OPTIMIZATION");
for(const date of dates){
 const ticker=provisionalNqContract(date),prior=iso(ms(date)-86400000);
 const bars=[...await load(ticker,prior),...await load(ticker,date)].sort((a,b)=>a.timestampMs-b.timestampMs);
 const day=rthBars(bars,date),overnight=overnightBars(bars,date);
 if(isProvisionalRoll(date)||auditRthCoverage(day,date,ticker).status!=="COMPLETE"||overnight.length!==930||overnight.some((b,i)=>i>0&&b.timestampMs-overnight[i-1]!.timestampMs!==60000)||new Set(bars.map(b=>b.timestampMs)).size!==bars.length){excluded++;continue;}
 eligible++;const seen=new Set<string>();
 for(const level of knownLevels(day,overnight)){
  const event=firstWickRejection(day,level);if(!event)continue;raw++;
  const key=[event.timestampMs,event.levelPrice,event.direction].join("|");if(seen.has(key))continue;seen.add(key);
  const sign=event.direction==="LONG"?1:-1;
  const end=day[event.barIndex+10],entry=day[event.barIndex+1];
  rows.push({date,kind:event.kind,direction:event.direction,depth:event.depthPoints,closeInside:event.closeInsidePoints,forward:end?sign*(end.close-day[event.barIndex]!.close):null,entryToTenClose:entry&&end?sign*(end.close-entry.open):null});
 }
}
for(const group of ["ALL","LONG","SHORT","OVERNIGHT","OPENING_RANGE"]){
 const items=rows.filter(r=>group==="ALL"||group==="LONG"&&r.direction==="LONG"||group==="SHORT"&&r.direction==="SHORT"||group==="OVERNIGHT"&&r.kind.startsWith("OVERNIGHT")||group==="OPENING_RANGE"&&r.kind.startsWith("ORB"));
 const complete=items.filter(r=>r.entryToTenClose!==null);
 console.log("WICK_GROUP",JSON.stringify({group,events:items.length,completeTenMinute:complete.length,positive:complete.filter(r=>r.entryToTenClose!>0).length,negative:complete.filter(r=>r.entryToTenClose!<0).length,flat:complete.filter(r=>r.entryToTenClose===0).length,medianWickDepthPoints:median(items.map(r=>r.depth)),medianCloseInsidePoints:median(items.map(r=>r.closeInside)),medianNextOpenToTenClosePoints:median(complete.map(r=>r.entryToTenClose!)),notAWinRate:true}));
}
console.log("WICK_CENSUS_COMPLETE",JSON.stringify({eligible,excluded,raw,uniqueEvents:rows.length,firstPerLevelOnly:true,exactPriceTimeDedupOnly:true,correlatedObservations:true,noFeesStopsOrTradePnl:true,noLiveApproval:true}));

/** Context-at-event descriptive census. Fixed categories, no thresholds tuned to outcomes. */
import {CachedHistoricalDays} from "../research/historical-cache.js";
import {auditRthCoverage} from "../research/rth-coverage.js";
import {overnightBars} from "../research/session-features.js";
import {knownLevels,rthBars} from "../research/level-reclaim.js";
import {firstWickRejection} from "../research/wick-rejection.js";
import {marketContextAt} from "../research/market-context.js";
import {provisionalClosedDates,provisionalNqContract,isProvisionalRoll} from "./massive-nq-calendar-policy.js";
const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("NETWORK_DISABLED");}});
const ms=(s:string)=>Date.parse(s+"T00:00:00Z"),iso=(t:number)=>new Date(t).toISOString().slice(0,10);
const dates:string[]=[];for(let t=ms("2026-10-02");dates.length<30;t-=86400000){const d=iso(t),w=new Date(t).getUTCDay();if(w!==0&&w!==6&&!provisionalClosedDates.has(d))dates.push(d);}dates.reverse();
const loaded=new Map<string,Awaited<ReturnType<typeof cache.getDay>>>();
async function load(ticker:string,date:string){const k=ticker+"|"+date;if(!loaded.has(k))loaded.set(k,await cache.getDay({ticker,productCode:"NQ"},date));return loaded.get(k)!;}
type Row={date:string;direction:"LONG"|"SHORT";vwapSide:"ABOVE"|"BELOW"|"UNAVAILABLE";fiveDirection:"UP"|"DOWN"|"FLAT"|"UNAVAILABLE";move:number|null;fiveRange:number|null;room:number|null};
const rows:Row[]=[];let eligible=0,excluded=0,raw=0;
const median=(xs:number[])=>{if(!xs.length)return null;const a=[...xs].sort((x,y)=>x-y);return Math.round((a[Math.floor((a.length-1)/2)]!+a[Math.floor(a.length/2)]!)*50)/100;};
console.log("=== TM001 WICK MARKET CONTEXT DIAGNOSTIC ===");
console.log("IN_SAMPLE | CACHE_ONLY | ZERO_API | ZERO_TRADES | NO_PNL | NO_OPTIMIZATION");
for(const date of dates){
 const ticker=provisionalNqContract(date),prior=iso(ms(date)-86400000);
 const bars=[...await load(ticker,prior),...await load(ticker,date)].sort((a,b)=>a.timestampMs-b.timestampMs);
 const day=rthBars(bars,date),overnight=overnightBars(bars,date);
 if(isProvisionalRoll(date)||auditRthCoverage(day,date,ticker).status!=="COMPLETE"||overnight.length!==930||overnight.some((b,i)=>i>0&&b.timestampMs-overnight[i-1]!.timestampMs!==60000)||new Set(bars.map(b=>b.timestampMs)).size!==bars.length){excluded++;continue;}
 eligible++;const seen=new Set<string>(),levels=knownLevels(day,overnight);
 for(const level of levels){
  const e=firstWickRejection(day,level);if(!e)continue;raw++;
  const key=[e.timestampMs,e.levelPrice,e.direction].join("|");if(seen.has(key))continue;seen.add(key);
  const ctx=marketContextAt(day,levels,e.barIndex),entry=day[e.barIndex+1],end=day[e.barIndex+10];
  const sign=e.direction==="LONG"?1:-1;
  rows.push({date,direction:e.direction,
   vwapSide:ctx.distanceFromVwapPoints===null?"UNAVAILABLE":ctx.distanceFromVwapPoints>0?"ABOVE":ctx.distanceFromVwapPoints<0?"BELOW":"UNAVAILABLE",
   fiveDirection:ctx.trailingFiveNetPoints===null?"UNAVAILABLE":ctx.trailingFiveNetPoints>0?"UP":ctx.trailingFiveNetPoints<0?"DOWN":"FLAT",
   move:entry&&end?sign*(end.close-entry.open):null,
   fiveRange:ctx.trailingFiveRangePoints,
   room:e.direction==="LONG"?ctx.nearestAbovePoints:ctx.nearestBelowPoints});
 }
}
function report(family:string,group:string,items:Row[]){
 const complete=items.filter(r=>r.move!==null),values=complete.map(r=>r.move!);
 console.log("CONTEXT_GROUP",JSON.stringify({family,group,events:items.length,complete:complete.length,positive:values.filter(v=>v>0).length,negative:values.filter(v=>v<0).length,flat:values.filter(v=>v===0).length,medianNextOpenToTenClosePoints:median(values),medianFiveMinuteRangePoints:median(items.flatMap(r=>r.fiveRange===null?[]:[r.fiveRange])),medianNearestKnownRoomPoints:median(items.flatMap(r=>r.room===null?[]:[r.room])),distinctSessions:new Set(items.map(r=>r.date)).size,notTradePnl:true}));
}
report("ALL","ALL",rows);
for(const side of ["ABOVE","BELOW","UNAVAILABLE"])report("VWAP_SIDE",side,rows.filter(r=>r.vwapSide===side));
for(const dir of ["UP","DOWN","FLAT","UNAVAILABLE"])report("FIVE_BAR_DIRECTION",dir,rows.filter(r=>r.fiveDirection===dir));
for(const dir of ["LONG","SHORT"])report("EVENT_DIRECTION",dir,rows.filter(r=>r.direction===dir));
console.log("CONTEXT_DIAGNOSTIC_COMPLETE",JSON.stringify({eligible,excluded,raw,uniqueEvents:rows.length,contextAtEventClose:true,entryEarliestNextOpen:true,fixedNonOptimizedGroups:true,correlatedObservations:true,noStopsFeesOrPnl:true,noLiveApproval:true}));

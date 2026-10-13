/** MFE/MAE of wick signals with physical-candle dedup. Descriptive only. */
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
type Alignment="ALIGNED"|"COUNTERTREND"|"FLAT"|"UNAVAILABLE";
type Row={date:string;timestamp:number;direction:"LONG"|"SHORT";alignment:Alignment;move:number|null;mfe:number|null;mae:number|null;levelsAtCandle:number};
const rows:Row[]=[];let eligible=0,excluded=0,raw=0,exactUnique=0;
const median=(xs:number[])=>{if(!xs.length)return null;const a=[...xs].sort((x,y)=>x-y);return Math.round((a[Math.floor((a.length-1)/2)]!+a[Math.floor(a.length/2)]!)*50)/100;};
console.log("=== TM001 WICK EVENT INDEPENDENCE AND EXCURSION ===");
console.log("IN_SAMPLE | CACHE_ONLY | ZERO_API | ZERO_TRADES | NO_PNL | NO_OPTIMIZATION");
for(const date of dates){
 const ticker=provisionalNqContract(date),prior=iso(ms(date)-86400000);
 const bars=[...await load(ticker,prior),...await load(ticker,date)].sort((a,b)=>a.timestampMs-b.timestampMs);
 const day=rthBars(bars,date),overnight=overnightBars(bars,date);
 if(isProvisionalRoll(date)||auditRthCoverage(day,date,ticker).status!=="COMPLETE"||overnight.length!==930||overnight.some((b,i)=>i>0&&b.timestampMs-overnight[i-1]!.timestampMs!==60000)||new Set(bars.map(b=>b.timestampMs)).size!==bars.length){excluded++;continue;}
 eligible++;const exactSeen=new Set<string>(),physical=new Map<string,Row>(),levels=knownLevels(day,overnight);
 for(const level of levels){
  const e=firstWickRejection(day,level);if(!e)continue;raw++;
  const exactKey=[e.timestampMs,e.levelPrice,e.direction].join("|");if(exactSeen.has(exactKey))continue;exactSeen.add(exactKey);exactUnique++;
  const ctx=marketContextAt(day,levels,e.barIndex),net=ctx.trailingFiveNetPoints;
  const alignment:Alignment=net===null?"UNAVAILABLE":net===0?"FLAT":(net>0&&e.direction==="LONG"||net<0&&e.direction==="SHORT")?"ALIGNED":"COUNTERTREND";
  const entry=day[e.barIndex+1],end=day[e.barIndex+10],window=day.slice(e.barIndex+1,e.barIndex+11);
  const full=!!entry&&!!end&&window.length===10,sign=e.direction==="LONG"?1:-1;
  const favorable=full?Math.max(0,...window.map(b=>e.direction==="LONG"?b.high-entry!.open:entry!.open-b.low)):null;
  const adverse=full?Math.max(0,...window.map(b=>e.direction==="LONG"?entry!.open-b.low:b.high-entry!.open)):null;
  const physicalKey=[e.timestampMs,e.direction].join("|");
  const existing=physical.get(physicalKey);
  if(existing){existing.levelsAtCandle++;continue;}
  physical.set(physicalKey,{date,timestamp:e.timestampMs,direction:e.direction,alignment,move:full?sign*(end!.close-entry!.open):null,mfe:favorable,mae:adverse,levelsAtCandle:1});
 }
 rows.push(...physical.values());
}
function report(direction:string,alignment:string,items:Row[]){
 const complete=items.filter(r=>r.move!==null),values=complete.map(r=>r.move!),mfe=complete.map(r=>r.mfe!),mae=complete.map(r=>r.mae!);
 console.log("EXCURSION_GROUP",JSON.stringify({direction,alignment,events:items.length,complete:complete.length,positive:values.filter(v=>v>0).length,negative:values.filter(v=>v<0).length,medianNextOpenToTenClosePoints:median(values),medianMfePoints:median(mfe),medianMaePoints:median(mae),medianMfeMinusMaePoints:median(complete.map(r=>r.mfe!-r.mae!)),distinctSessions:new Set(items.map(r=>r.date)).size,multiLevelCandles:items.filter(r=>r.levelsAtCandle>1).length,noIntrabarOrdering:true}));
}
report("ALL","ALL",rows);
for(const alignment of ["ALIGNED","COUNTERTREND","FLAT","UNAVAILABLE"])report("ALL",alignment,rows.filter(r=>r.alignment===alignment));
for(const direction of ["LONG","SHORT"])for(const alignment of ["ALIGNED","COUNTERTREND"])report(direction,alignment,rows.filter(r=>r.direction===direction&&r.alignment===alignment));
console.log("EXCURSION_COMPLETE",JSON.stringify({eligible,excluded,raw,exactUnique,physicalCandleDirectionEvents:rows.length,collapsedExactDuplicates:raw-exactUnique,collapsedSameCandleDirection:exactUnique-rows.length,independentSessions:new Set(rows.map(r=>r.date)).size,firstPerLevelOnly:true,stillCorrelatedAcrossNearbyCandles:true,fullTenBarWindowIncludesEntryBar:true,entryAtNextBarOpenHypothetical:true,noStopsFeesOrTradePnl:true,noLiveApproval:true}));

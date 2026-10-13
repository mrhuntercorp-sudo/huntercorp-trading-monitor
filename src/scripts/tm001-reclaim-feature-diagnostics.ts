/** In-sample diagnostic stratification; no threshold selection or simulated trading. */
import {CachedHistoricalDays} from "../research/historical-cache.js";
import {auditRthCoverage} from "../research/rth-coverage.js";
import {overnightBars} from "../research/session-features.js";
import {knownLevels,firstReclaim,forwardExcursion,rthBars} from "../research/level-reclaim.js";
import {provisionalClosedDates,provisionalNqContract,isProvisionalRoll} from "./massive-nq-calendar-policy.js";
const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("NETWORK_DISABLED");}});
const dayMs=86400000,ms=(s:string)=>Date.parse(s+"T00:00:00Z"),iso=(t:number)=>new Date(t).toISOString().slice(0,10);
const dates:string[]=[];for(let t=ms("2026-10-02");dates.length<30;t-=dayMs){const d=iso(t),w=new Date(t).getUTCDay();if(w!==0&&w!==6&&!provisionalClosedDates.has(d))dates.push(d);}dates.reverse();
const loaded=new Map<string,Awaited<ReturnType<typeof cache.getDay>>>();
async function load(ticker:string,date:string){const k=ticker+"|"+date;if(!loaded.has(k))loaded.set(k,await cache.getDay({ticker,productCode:"NQ"},date));return loaded.get(k)!;}
type Obs={date:string;kind:string;direction:string;reclaimIndex:number;delay:number;penetration:number;orbWidth:number;forward:number|null;favorable:number|null;adverse:number|null};
const observations:Obs[]=[];
console.log("=== TM001 RECLAIM FEATURE DIAGNOSTICS ===");
console.log("IN_SAMPLE | DESCRIPTIVE_ONLY | ZERO_API | ZERO_TRADES | NO_THRESHOLD_TUNING");
for(const date of dates){
 const ticker=provisionalNqContract(date),prior=iso(ms(date)-dayMs);
 const bars=[...await load(ticker,prior),...await load(ticker,date)].sort((a,b)=>a.timestampMs-b.timestampMs);
 const day=rthBars(bars,date),overnight=overnightBars(bars,date);
 if(isProvisionalRoll(date)||auditRthCoverage(day,date,ticker).status!=="COMPLETE"||overnight.length!==930||overnight.some((b,i)=>i>0&&b.timestampMs-overnight[i-1]!.timestampMs!==60000)||new Set(bars.map(b=>b.timestampMs)).size!==bars.length)continue;
 const seen=new Set<string>();
 const fiveWidth=Math.max(...day.slice(0,5).map(b=>b.high))-Math.min(...day.slice(0,5).map(b=>b.low));
 for(const level of knownLevels(day,overnight)){
  const event=firstReclaim(day,level);if(!event)continue;
  const key=[event.reclaimTimestampMs,event.price,event.direction].join("|");if(seen.has(key))continue;seen.add(key);
  const f=forwardExcursion(day,event,10);
  const penetration=Math.abs(event.breakoutClose-level.price);
  const obs={date,kind:level.kind,direction:event.direction,reclaimIndex:event.reclaimIndex,delay:event.reclaimIndex-event.breakoutIndex,penetration,orbWidth:fiveWidth,forward:f.closeMovePoints,favorable:f.maxFavorablePoints,adverse:f.maxAdversePoints};
  observations.push(obs);
 }
}
const groups=new Map<string,Obs[]>();
for(const o of observations){for(const k of ["ALL",o.kind,o.kind.startsWith("OVERNIGHT")?"OVERNIGHT":"OPENING_RANGE",o.direction]){const a=groups.get(k)??[];a.push(o);groups.set(k,a);}}
const round=(n:number)=>Math.round(n*100)/100;
const median=(a:number[])=>{if(!a.length)return null;const s=[...a].sort((x,y)=>x-y);return round((s[Math.floor((s.length-1)/2)]!+s[Math.floor(s.length/2)]!)/2);};
for(const [group,items] of groups){
 const complete=items.filter(o=>o.forward!==null);
 const positive=complete.filter(o=>o.forward!>0).length;
 const negative=complete.filter(o=>o.forward!<0).length;
 console.log("FEATURE_GROUP",JSON.stringify({group,events:items.length,fullForward:complete.length,positive,negative,flat:complete.length-positive-negative,medianDelayMinutes:median(items.map(o=>o.delay)),medianPenetrationPoints:median(items.map(o=>o.penetration)),medianOpening5WidthPoints:median(items.map(o=>o.orbWidth)),medianFavorablePoints:median(complete.map(o=>o.favorable!)),medianAdversePoints:median(complete.map(o=>o.adverse!)),medianCloseMovePoints:median(complete.map(o=>o.forward!)),notAWinRate:true}));
}
console.log("FEATURE_DIAGNOSTICS_COMPLETE",JSON.stringify({uniqueEvents:observations.length,groups:groups.size,independentEvents:false,noLiveApproval:true}));

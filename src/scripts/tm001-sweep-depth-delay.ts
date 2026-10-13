/** Historical sweep depth versus reclaim delay; descriptive, no fitted thresholds. */
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
type Observation={date:string;kind:string;direction:string;delay:number;firstClosePenetration:number;maxWickPenetration:number;maxClosePenetration:number;forward:number|null;adverse:number|null;favorable:number|null};
const rows:Observation[]=[];
const median=(values:number[])=>{if(!values.length)return null;const a=[...values].sort((x,y)=>x-y),i=Math.floor((a.length-1)/2),j=Math.floor(a.length/2);return Math.round((a[i]!+a[j]!)*50)/100;};
console.log("=== TM001 SWEEP DEPTH AND RECLAIM DELAY ===");
console.log("IN_SAMPLE_DIAGNOSTIC | NO_OPTIMIZATION | ZERO_API | ZERO_TRADES | NO_WRITES");
for(const date of dates){
 const ticker=provisionalNqContract(date),prior=iso(ms(date)-dayMs);
 const bars=[...await load(ticker,prior),...await load(ticker,date)].sort((a,b)=>a.timestampMs-b.timestampMs);
 const day=rthBars(bars,date),overnight=overnightBars(bars,date);
 if(isProvisionalRoll(date)||auditRthCoverage(day,date,ticker).status!=="COMPLETE"||overnight.length!==930||overnight.some((b,i)=>i>0&&b.timestampMs-overnight[i-1]!.timestampMs!==60000)||new Set(bars.map(b=>b.timestampMs)).size!==bars.length)continue;
 const seen=new Set<string>();
 for(const level of knownLevels(day,overnight)){
  const e=firstReclaim(day,level);if(!e)continue;
  const key=[e.reclaimTimestampMs,e.price,e.direction].join("|");if(seen.has(key))continue;seen.add(key);
  const outside=day.slice(e.breakoutIndex,e.reclaimIndex+1);
  const maxWickPenetration=Math.max(0,...outside.map(b=>level.side==="HIGH"?b.high-level.price:level.price-b.low));
  const maxClosePenetration=Math.max(0,...outside.map(b=>level.side==="HIGH"?b.close-level.price:level.price-b.close));
  const f=forwardExcursion(day,e,10);
  rows.push({date,kind:level.kind,direction:e.direction,delay:e.reclaimIndex-e.breakoutIndex,firstClosePenetration:Math.abs(e.breakoutClose-level.price),maxWickPenetration,maxClosePenetration,forward:f.closeMovePoints,adverse:f.maxAdversePoints,favorable:f.maxFavorablePoints});
 }
}
for(const label of ["ALL","IMMEDIATE_1_BAR","SHORT_2_TO_5_BARS","LONG_6_PLUS_BARS"]){
 const items=rows.filter(r=>label==="ALL"||label==="IMMEDIATE_1_BAR"&&r.delay===1||label==="SHORT_2_TO_5_BARS"&&r.delay>=2&&r.delay<=5||label==="LONG_6_PLUS_BARS"&&r.delay>=6);
 const full=items.filter(r=>r.forward!==null),positive=full.filter(r=>r.forward!>0).length,negative=full.filter(r=>r.forward!<0).length;
 console.log("SWEEP_DELAY_GROUP",JSON.stringify({group:label,events:items.length,complete:full.length,positive,negative,flat:full.length-positive-negative,medianDelayBars:median(items.map(r=>r.delay)),medianFirstClosePenetrationPoints:median(items.map(r=>r.firstClosePenetration)),medianMaxWickPenetrationPoints:median(items.map(r=>r.maxWickPenetration)),medianMaxClosePenetrationPoints:median(items.map(r=>r.maxClosePenetration)),medianForwardClosePoints:median(full.map(r=>r.forward!)),medianFavorablePoints:median(full.map(r=>r.favorable!)),medianAdversePoints:median(full.map(r=>r.adverse!)),descriptiveOnly:true}));
}
console.log("SWEEP_DIAGNOSTICS_COMPLETE",JSON.stringify({events:rows.length,method:"first breakout-close then first reclaim-close; depth measured only through reclaim bar; future evaluated separately",thresholdsExploratoryNotTradingRules:true}));

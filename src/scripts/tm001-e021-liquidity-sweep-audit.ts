/** E021: offline NQ high/low wick-sweep event study; descriptive, not a trade backtest. */
import { CachedHistoricalDays } from "../research/historical-cache.js";
import { auditRthCoverage } from "../research/rth-coverage.js";
import { overnightBars } from "../research/session-features.js";
import { rthBars, knownLevels } from "../research/level-reclaim.js";
import { firstWickRejection } from "../research/wick-rejection.js";
import { newYorkClock } from "../market/time.js";
import { provisionalClosedDates, provisionalNqContract, isProvisionalRoll } from "./massive-nq-calendar-policy.js";
import type { MinuteBar } from "../market/types.js";

const cache = new CachedHistoricalDays({async getContractMinuteBars(){throw Error("NETWORK_DISABLED");}});
const iso = (t:number)=>new Date(t).toISOString().slice(0,10);
const dayMs = 86400000;
const end = process.argv[2] ?? "2026-10-02";
if (!/^\d{4}-\d{2}-\d{2}$/.test(end) || !Number.isFinite(Date.parse(end+"T00:00:00Z")) ||
    new Date(end+"T00:00:00Z").toISOString().slice(0,10)!==end) throw Error("INVALID_END_DATE");
const dates:string[]=[];
for(let t=Date.parse(end+"T00:00:00Z");dates.length<30;t-=dayMs){
 const d=iso(t),w=new Date(t).getUTCDay();
 if(w!==0&&w!==6&&!provisionalClosedDates.has(d))dates.push(d);
}
dates.reverse();
const loaded=new Map<string,MinuteBar[]>();
async function load(ticker:string,date:string){
 const key=ticker+"|"+date;
 if(!loaded.has(key))loaded.set(key,await cache.getDay({ticker,productCode:"NQ"},date));
 return loaded.get(key)!;
}
type Observation={date:string;kind:string;side:"HIGH"|"LOW";direction:"LONG"|"SHORT";depth:number;inside:number;forwardBars:number;favorable:number;adverse:number;closeMove:number;entryMinute:number};
const observations:Observation[]=[];
const exclusions:{date:string;reason:string}[]=[];
const horizon=10;
for(const date of dates){
 const ticker=provisionalNqContract(date);
 if(isProvisionalRoll(date)){exclusions.push({date,reason:"PROVISIONAL_ROLL"});continue;}
 try{
  const prior=iso(Date.parse(date+"T00:00:00Z")-dayMs);
  const bars=[...await load(ticker,prior),...await load(ticker,date)].sort((a,b)=>a.timestampMs-b.timestampMs);
  if(new Set(bars.map(b=>b.timestampMs)).size!==bars.length)throw Error("DUPLICATE_BARS");
  const day=rthBars(bars,date),overnight=overnightBars(bars,date);
  if(auditRthCoverage(day,date,ticker).status!=="COMPLETE" || overnight.length!==930 ||
     overnight.some((b,i)=>i>0&&b.timestampMs-overnight[i-1]!.timestampMs!==60000))
    throw Error("INCOMPLETE_SESSION");
  for(const level of knownLevels(day,overnight)){
   const event=firstWickRejection(day,level);
   if(!event || event.barIndex+1+horizon>day.length)continue;
   const entry=day[event.barIndex+1]!.open; // causal next-bar reference, NOT simulated fill
   const future=day.slice(event.barIndex+1,event.barIndex+1+horizon);
   const sign=event.direction==="LONG"?1:-1;
   const favorable=Math.max(0,...future.map(b=>sign===1?b.high-entry:entry-b.low));
   const adverse=Math.max(0,...future.map(b=>sign===1?entry-b.low:b.high-entry));
   const closeMove=sign*(future.at(-1)!.close-entry);
   const c=newYorkClock(event.timestampMs);
   observations.push({date,kind:event.kind,side:level.side,direction:event.direction,
    depth:event.depthPoints,inside:event.closeInsidePoints,forwardBars:future.length,
    favorable,adverse,closeMove,entryMinute:c.hour*60+c.minute});
  }
 }catch(error){
  const reason=error instanceof Error?error.message:String(error);
  if(reason.startsWith("NETWORK_DISABLED"))throw error;
  exclusions.push({date,reason:reason.includes("ENOENT")?"MISSING_CACHE":reason});
 }
}
const round=(v:number)=>Math.round(v*100)/100;
const summary=(a:Observation[])=>({
 events:a.length,distinctSessions:new Set(a.map(x=>x.date)).size,
 positiveTenBarClose:a.filter(x=>x.closeMove>0).length,
 negativeTenBarClose:a.filter(x=>x.closeMove<0).length,
 avgTenBarClosePoints:a.length?round(a.reduce((s,x)=>s+x.closeMove,0)/a.length):null,
 avgMaxFavorablePoints:a.length?round(a.reduce((s,x)=>s+x.favorable,0)/a.length):null,
 avgMaxAdversePoints:a.length?round(a.reduce((s,x)=>s+x.adverse,0)/a.length):null,
 // Favorable and adverse excursions can occur in either order: NOT a win rate or fill model.
});
console.log("=== TM001 E021 HIGH/LOW LIQUIDITY SWEEP AUDIT ===");
console.log("HISTORICAL_IN_SAMPLE | CACHE_ONLY | ZERO_API | ZERO_ORDERS | DESCRIPTIVE_ONLY");
console.log("METHOD",JSON.stringify({sessionsRequested:dates.length,endDate:end,horizonBars:horizon,
 levels:["OVERNIGHT_HIGH","OVERNIGHT_LOW","ORB_5_HIGH","ORB_5_LOW","ORB_15_HIGH","ORB_15_LOW"],
 signal:"FIRST_COMPLETED_CANDLE_WICKS_STRICTLY_BEYOND_KNOWN_LEVEL_AND_CLOSES_INSIDE",
 reference:"NEXT_BAR_OPEN",dedupe:"ONE_EVENT_PER_LEVEL_PER_SESSION",overlap:"LEVEL_EVENTS_CAN_OVERLAP",
 notIncluded:["PRIOR_DAY_HIGH_LOW","ASIA_HIGH_LOW","LONDON_HIGH_LOW","COMMISSIONS","STOP_TARGET_FILL_MODEL"],
 warning:"OHLC CANNOT PROVE LIQUIDITY OR INTRABAR ORDER; NOT INDEPENDENT OOS"}));
console.log("SESSION_COVERAGE",JSON.stringify({requested:dates.length,complete:dates.length-exclusions.length,excluded:exclusions}));
for(const kind of ["OVERNIGHT_HIGH","OVERNIGHT_LOW","ORB_5_HIGH","ORB_5_LOW","ORB_15_HIGH","ORB_15_LOW"]){
 const a=observations.filter(x=>x.kind===kind);
 console.log("LEVEL_RESULT",JSON.stringify({kind,...summary(a),nyOpenBefore11:summary(a.filter(x=>x.entryMinute<660))}));
}
console.log("SIDE_RESULT",JSON.stringify({highSweeps:summary(observations.filter(x=>x.side==="HIGH")),
 lowSweeps:summary(observations.filter(x=>x.side==="LOW"))}));
console.log("E021_COMPLETE",JSON.stringify({observations:observations.length,noEdgeClaim:true,noOrders:true,noApi:true}));

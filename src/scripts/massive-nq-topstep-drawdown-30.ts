import { CachedHistoricalDays } from "../research/historical-cache.js";
import { backtestConservativeOrb } from "../research/conservative-orb.js";
import { auditRthCoverage } from "../research/rth-coverage.js";
import { overnightBars } from "../research/session-features.js";
import { newYorkClock } from "../market/time.js";
import { provisionalClosedDates, provisionalNqContract, isProvisionalRoll } from "./massive-nq-calendar-policy.js";
import type { MinuteBar } from "../market/types.js";

console.log("=== TM001 TOPSTEP DRAWDOWN RESEARCH ===");
console.log("READ ONLY | CACHE ONLY | NO API | NO WRITES | NO TRADES");
const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("NETWORK_DISABLED");}});
const dayMs=86400000,ms=(s:string)=>Date.parse(s+"T00:00:00Z"),iso=(t:number)=>new Date(t).toISOString().slice(0,10);
const dates:string[]=[];
for(let t=ms("2026-10-02");dates.length<30;t-=dayMs){const d=iso(t),w=new Date(t).getUTCDay();if(w!==0&&w!==6&&!provisionalClosedDates.has(d))dates.push(d);}
dates.reverse();
const loaded=new Map<string,MinuteBar[]>();
async function load(ticker:string,date:string){const k=ticker+":"+date;if(!loaded.has(k))loaded.set(k,await cache.getDay({ticker,productCode:"NQ"},date));return loaded.get(k)!;}
const selected:MinuteBar[]=[],excluded:{date:string;reason:string}[]=[];
for(const date of dates){
 const ticker=provisionalNqContract(date),prior=iso(ms(date)-dayMs);
 const bars=[...await load(ticker,prior),...await load(ticker,date)].sort((a,b)=>a.timestampMs-b.timestampMs);
 if(new Set(bars.map(b=>b.timestampMs)).size!==bars.length){excluded.push({date,reason:"DUPLICATE_TIMESTAMPS"});continue;}
 const rth=bars.filter(b=>{const c=newYorkClock(b.timestampMs),m=c.hour*60+c.minute;return c.date===date&&m>=570&&m<960;});
 const overnight=overnightBars(bars,date);
 if(isProvisionalRoll(date)){excluded.push({date,reason:"ROLLOVER_UNVERIFIED"});continue;}
 if(auditRthCoverage(rth,date,ticker).status!=="COMPLETE"){excluded.push({date,reason:"INCOMPLETE_RTH"});continue;}
 if(overnight.length!==930||overnight.some((b,i)=>i>0&&b.timestampMs-overnight[i-1]!.timestampMs!==60000)){excluded.push({date,reason:"INCOMPLETE_OVERNIGHT"});continue;}
 selected.push(...rth);
}
console.log("ELIGIBILITY "+JSON.stringify({candidateDates:dates.length,eligibleSessions:dates.length-excluded.length,excluded,provisionalSchedule:true}));
const pairs:[number,number][]=[[20,40],[20,60],[40,40],[40,120]];
const limits=[2000,3000];
for(const [stopPoints,targetPoints] of pairs){
 for(const extraSlippageTicksPerSide of [0,1,2]){
  const slippageTicksPerSide=1+extraSlippageTicksPerSide;
  const result=backtestConservativeOrb(selected,{openingRangeMinutes:5,stopPoints,targetPoints,contracts:1,friction:{roundTripCommissionUsd:6,slippageTicksPerSide}});
  if(result.excluded.length)throw Error("MODEL_EXCLUSIONS "+JSON.stringify(result.excluded));
  const trades=[...result.trades].sort((a,b)=>a.date.localeCompare(b.date));
  let equity=0,peak=0,maxDrawdownUsd=0,lossStreak=0,maxLossStreak=0;
  const breaches:Record<string,{breached:boolean;date:string|null;tradeIndex:number|null}>={};
  for(const limit of limits)breaches[String(limit)]={breached:false,date:null,tradeIndex:null};
  for(let i=0;i<trades.length;i++){
   const t=trades[i]!;
   equity+=t.netPnlUsd;peak=Math.max(peak,equity);maxDrawdownUsd=Math.max(maxDrawdownUsd,peak-equity);
   lossStreak=t.netPnlUsd<0?lossStreak+1:0;maxLossStreak=Math.max(maxLossStreak,lossStreak);
   for(const limit of limits){const b=breaches[String(limit)]!;if(!b.breached&&peak-equity>=limit){b.breached=true;b.date=t.date;b.tradeIndex=i+1;}}
  }
  const netUsd=trades.reduce((s,t)=>s+t.netPnlUsd,0);
  console.log("SCENARIO "+JSON.stringify({stopPoints,targetPoints,slippageTicksPerSide,trades:trades.length,wins:trades.filter(t=>t.netPnlUsd>0).length,netUsd,maxDrawdownUsd,maxLossStreak,closedTradeTrailingThresholdBreaches:breaches,
   caveat:"Closed-trade peak-to-trough proxy ONLY; not a Topstep compliance or intraday equity simulation; daily loss limits, payouts, account type, and actual fills unmodeled"}));
 }
}
console.log("TM001 DRAWDOWN RESEARCH COMPLETE — NO STRATEGY APPROVAL");

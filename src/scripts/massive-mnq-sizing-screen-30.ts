import { CachedHistoricalDays } from "../research/historical-cache.js";
import { backtestConservativeOrb } from "../research/conservative-orb.js";
import { auditRthCoverage } from "../research/rth-coverage.js";
import { overnightBars } from "../research/session-features.js";
import { newYorkClock } from "../market/time.js";
import { provisionalClosedDates, provisionalNqContract, isProvisionalRoll } from "./massive-nq-calendar-policy.js";
import type { MinuteBar } from "../market/types.js";

console.log("=== TM001 MNQ POSITION SIZE / ACCOUNT THRESHOLD SCREEN ===");
console.log("CACHE ONLY | ZERO API | ZERO WRITES | ZERO TRADES | NOT TOPSTEP RULE CERTIFICATION");
const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("NETWORK_DISABLED_CACHE_ONLY");}});
const dayMs=86400000,ms=(s:string)=>Date.parse(s+"T00:00:00Z"),iso=(t:number)=>new Date(t).toISOString().slice(0,10);
const dates:string[]=[];
for(let t=ms("2026-10-02");dates.length<30;t-=dayMs){const d=iso(t),w=new Date(t).getUTCDay();if(w!==0&&w!==6&&!provisionalClosedDates.has(d))dates.push(d);}
dates.reverse();
const loaded=new Map<string,MinuteBar[]>();
async function load(ticker:string,date:string){const key=ticker+":"+date;if(!loaded.has(key))loaded.set(key,await cache.getDay({ticker,productCode:"NQ"},date));return loaded.get(key)!;}
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
console.log("ELIGIBILITY "+JSON.stringify({candidateDates:dates.length,eligibleSessions:dates.length-excluded.length,excluded,calendarAndRollProvisional:true}));
console.log("ASSUMPTIONS "+JSON.stringify({source:"NQ historical price bars used as MNQ price-path proxy, NOT actual MNQ fills",mnqPointValueUsd:2,mnqTickValueUsd:0.5,mnqCommissionRoundTripPerContractUsd:2,slippageTicksPerSide:[1,3],positionSizesMnq:[1,2,3,5,10],limitsUsd:[2000,3000],noAccountRuleCertification:true}));
for(const [stopPoints,targetPoints] of [[20,40],[20,60],[40,40],[40,120]] as const){
 const backtest=backtestConservativeOrb(selected,{openingRangeMinutes:5,stopPoints,targetPoints,contracts:1,friction:{roundTripCommissionUsd:0,slippageTicksPerSide:0}});
 if(backtest.excluded.length)throw Error("MODEL_EXCLUSIONS "+JSON.stringify(backtest.excluded));
 const trades=[...backtest.trades].sort((a,b)=>a.date.localeCompare(b.date));
 for(const contractsMnq of [1,2,3,5,10]){
  for(const slip of [1,3]){
   const frictionPerContract=2+2*slip*0.5;
   let equity=0,peak=0,maxDrawdownUsd=0,maxLossStreak=0,lossStreak=0;
   const breaches:Record<string,string|null>={"2000":null,"3000":null};
   for(const t of trades){
    const pnl=(t.exit-t.entry)*(t.direction==="LONG"?1:-1)*2*contractsMnq-frictionPerContract*contractsMnq;
    equity+=pnl;peak=Math.max(peak,equity);maxDrawdownUsd=Math.max(maxDrawdownUsd,peak-equity);
    lossStreak=pnl<0?lossStreak+1:0;maxLossStreak=Math.max(maxLossStreak,lossStreak);
    for(const limit of [2000,3000])if(breaches[String(limit)]===null&&peak-equity>=limit)breaches[String(limit)]=t.date;
   }
   console.log("SCENARIO "+JSON.stringify({stopPoints,targetPoints,contractsMnq,slippageTicksPerSide:slip,netUsd:Number(equity.toFixed(2)),maxClosedTradeDrawdownUsd:Number(maxDrawdownUsd.toFixed(2)),maxLossStreak,thresholdFirstTouchDate:breaches,nominalStopLossUsd:Number(((stopPoints*2+frictionPerContract)*contractsMnq).toFixed(2)),trades:trades.length}));
  }
 }
}
console.log("TM001 MNQ SCREEN COMPLETE | CLOSED-TRADE ONLY | NO STRATEGY APPROVAL");

import { CachedHistoricalDays } from "../research/historical-cache.js";
import { backtestConservativeOrb } from "../research/conservative-orb.js";
import { auditRthCoverage } from "../research/rth-coverage.js";
import { overnightBars } from "../research/session-features.js";
import { newYorkClock } from "../market/time.js";
import { provisionalClosedDates, provisionalNqContract, isProvisionalRoll } from "./massive-nq-calendar-policy.js";
import type { MinuteBar } from "../market/types.js";

console.log("=== TM001 NQ ORB STOP/TARGET SENSITIVITY MATRIX ===");
console.log("CACHE ONLY | ZERO API | ZERO WRITES | ZERO TRADES | EXPLORATORY");
const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("NETWORK_DISABLED");}});
const dates:string[]=[];
const dayMs=86400000;
const ms=(s:string)=>Date.parse(s+"T00:00:00Z");
const iso=(n:number)=>new Date(n).toISOString().slice(0,10);
for(let t=ms("2026-10-02");dates.length<30;t-=dayMs){
 const d=iso(t),w=new Date(t).getUTCDay();
 if(w!==0&&w!==6&&!provisionalClosedDates.has(d))dates.push(d);
}
dates.reverse();
const loaded=new Map<string,MinuteBar[]>();
async function load(ticker:string,date:string){
 const key=ticker+":"+date;
 if(!loaded.has(key))loaded.set(key,await cache.getDay({ticker,productCode:"NQ"},date));
 return loaded.get(key)!;
}
const selected:MinuteBar[]=[];
const excluded:{date:string;reason:string}[]=[];
const eligible:string[]=[];
for(const date of dates){
 const ticker=provisionalNqContract(date),prior=iso(ms(date)-dayMs);
 const bars=[...await load(ticker,prior),...await load(ticker,date)].sort((a,b)=>a.timestampMs-b.timestampMs);
 if(new Set(bars.map(b=>b.timestampMs)).size!==bars.length){excluded.push({date,reason:"DUPLICATE_TIMESTAMPS"});continue;}
 const rth=bars.filter(b=>{const c=newYorkClock(b.timestampMs),m=c.hour*60+c.minute;return c.date===date&&m>=570&&m<960;});
 const overnight=overnightBars(bars,date);
 const overnightComplete=overnight.length===930&&overnight.every((b,i)=>i===0||b.timestampMs-overnight[i-1]!.timestampMs===60000);
 if(isProvisionalRoll(date)){excluded.push({date,reason:"ROLLOVER_UNVERIFIED"});continue;}
 if(auditRthCoverage(rth,date,ticker).status!=="COMPLETE"){excluded.push({date,reason:"INCOMPLETE_RTH"});continue;}
 if(!overnightComplete){excluded.push({date,reason:"INCOMPLETE_OVERNIGHT"});continue;}
 selected.push(...rth);eligible.push(date);
}
console.log("ELIGIBILITY "+JSON.stringify({candidateDates:dates.length,eligibleDates:eligible.length,excluded,calendarAndRolloverProvisional:true}));
const pairs:[number,number][]=[[20,20],[20,40],[20,60],[30,30],[30,60],[40,40],[40,60],[40,80],[40,120],[60,60],[60,90],[60,120],[60,180],[80,80],[80,120],[80,160],[100,200],[120,120],[120,240]];
const rows=[];
for(const [stopPoints,targetPoints] of pairs){
 const result=backtestConservativeOrb(selected,{openingRangeMinutes:5,stopPoints,targetPoints,contracts:1,friction:{roundTripCommissionUsd:6,slippageTicksPerSide:1}});
 if(result.excluded.length)throw Error("MODEL_EXCLUSIONS "+JSON.stringify(result.excluded));
 const trades=[...result.trades].sort((a,b)=>a.date.localeCompare(b.date));
 let equity=0,peak=0,maxDrawdownUsd=0;
 for(const t of trades){equity+=t.netPnlUsd;peak=Math.max(peak,equity);maxDrawdownUsd=Math.max(maxDrawdownUsd,peak-equity);}
 const netUsd=trades.reduce((s,t)=>s+t.netPnlUsd,0);
 const wins=trades.filter(t=>t.netPnlUsd>0).length;
 const weekLoss=trades.filter(t=>t.date>="2026-08-31"&&t.date<="2026-09-04").reduce((s,t)=>s+t.netPnlUsd,0);
 rows.push({stopPoints,targetPoints,riskReward:targetPoints/stopPoints,trades:trades.length,wins,losses:trades.filter(t=>t.netPnlUsd<0).length,winRatePct:trades.length?Number((100*wins/trades.length).toFixed(1)):null,netUsd,expectancyUsd:trades.length?Number((netUsd/trades.length).toFixed(2)):null,maxDrawdownUsd,aug31WeekUsd:weekLoss,ambiguousExits:trades.filter(t=>t.ambiguousExit).length,gapThroughStops:trades.filter(t=>t.gapThroughStop).length,sessionEndExits:trades.filter(t=>t.exitReason==="SESSION_END").length});
}
console.log("MATRIX "+JSON.stringify(rows));
console.log("TM001 MATRIX COMPLETE — SAME IN-SAMPLE DATA; NOT STRATEGY APPROVAL");

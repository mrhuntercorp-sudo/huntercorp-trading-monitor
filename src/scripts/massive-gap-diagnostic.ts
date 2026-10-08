import { CachedHistoricalDays } from "../research/historical-cache.js";
import type { FuturesContract, MinuteBar } from "../market/types.js";
const cache = new CachedHistoricalDays({async getContractMinuteBars(){throw Error("CACHE ONLY: provider access forbidden");}});
const contract=(ticker:string):FuturesContract=>({ticker,productCode:"NQ"});
async function pair(ticker:string,sunday:string,monday:string){
 return [...await cache.getDay(contract(ticker),sunday),...await cache.getDay(contract(ticker),monday)];
}
const candle=(b:MinuteBar|undefined)=>b?{utc:new Date(b.timestampMs).toISOString(),open:b.open,high:b.high,low:b.low,close:b.close,volume:b.volume}:null;
function context(bars:readonly MinuteBar[],t:number){
 const before=bars.filter(b=>b.timestampMs<t).at(-1);
 const at=bars.find(b=>b.timestampMs===t);
 const after=bars.find(b=>b.timestampMs>t);
 return {before:candle(before),at:candle(at),after:candle(after)};
}
console.log("=== TM001 GAP DIAGNOSTIC ===");
console.log("CACHE ONLY | NO IMPUTATION | NO TRADING APPROVAL");
const old=await pair("NQH6","2026-03-15","2026-03-16");
const next=await pair("NQM6","2026-03-15","2026-03-16");
const missing=Date.parse("2026-03-16T03:17:00Z");
console.log("MARCH_GAP_CONTEXT "+JSON.stringify({missingUtc:new Date(missing).toISOString(),outgoing:context(old,missing),incoming:context(next,missing)}));
const start=Date.parse("2026-03-15T22:00:00Z"),end=Date.parse("2026-03-16T13:30:00Z");
const a=new Map(old.filter(b=>b.timestampMs>=start&&b.timestampMs<end).map(b=>[b.timestampMs,b]));
const b=new Map(next.filter(x=>x.timestampMs>=start&&x.timestampMs<end).map(x=>[x.timestampMs,x]));
const times=[...a.keys()].filter(t=>b.has(t)).sort((x,y)=>x-y);
if(times.length!==929||a.has(missing)||!b.has(missing))throw Error("Unexpected March coverage: fail closed");
const offset=211.25;
const diffs=times.map(t=>{const x=a.get(t)!,y=b.get(t)!;return {high:y.high-offset-x.high,low:y.low-offset-x.low,close:y.close-offset-x.close};});
const mean=(key:"high"|"low"|"close")=>diffs.reduce((s,d)=>s+Math.abs(d[key]),0)/diffs.length;
let same=0,adjacent=0,skippedAcrossGap=0;
for(let i=1;i<times.length;i++){
 const current=times[i]!,previous=times[i-1]!;
 if(current-previous!==60000){skippedAcrossGap++;continue;}
 adjacent++;
 if(Math.sign(a.get(current)!.close-a.get(previous)!.close)===Math.sign(b.get(current)!.close-b.get(previous)!.close))same++;
}
console.log("MARCH_PARTIAL_COMPARISON "+JSON.stringify({status:"PARTIAL_DIAGNOSTIC_ONLY",matchedMinutes:times.length,expectedMinutes:930,omittedUtc:new Date(missing).toISOString(),offsetPoints:offset,meanAbsoluteHighDifferencePoints:mean("high"),meanAbsoluteLowDifferencePoints:mean("low"),meanAbsoluteCloseDifferencePoints:mean("close"),maxAbsoluteHighDifferencePoints:Math.max(...diffs.map(d=>Math.abs(d.high))),maxAbsoluteLowDifferencePoints:Math.max(...diffs.map(d=>Math.abs(d.low))),adjacentMinuteTransitions:adjacent,skippedAcrossGap,closeDirectionAgreement:same/adjacent}));
const sepOld=await cache.getDay(contract("NQU6"),"2026-09-11");
const sepNew=await cache.getDay(contract("NQZ6"),"2026-09-11");
const gapStart=Date.parse("2026-09-11T17:00:00Z"),gapEnd=Date.parse("2026-09-11T19:00:00Z");
for(const [ticker,bars] of [["NQU6",sepOld],["NQZ6",sepNew]] as const){
 console.log("SEPTEMBER_GAP_BOUNDARIES "+JSON.stringify({ticker,gapStartUtc:new Date(gapStart).toISOString(),gapEndExclusiveUtc:new Date(gapEnd).toISOString(),startBoundary:context(bars,gapStart),endBoundary:context(bars,gapEnd),status:"QUARANTINED"}));
}
console.log("TM001 GAP DIAGNOSTIC: COMPLETE (DESCRIPTIVE ONLY)");

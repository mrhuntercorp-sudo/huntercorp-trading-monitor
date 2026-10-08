import type { MinuteBar } from "../market/types.js";
import { newYorkClock } from "../market/time.js";

export type AdjustmentEvent={effectiveMs:number;knownAtMs:number;oldTicker:string;newTicker:string;spreadPoints:number};
export function validateCausalEvents(events:readonly AdjustmentEvent[]):void{
 let priorEffective=-Infinity,priorKnown=-Infinity;
 for(const e of events){
  if(!Number.isSafeInteger(e.effectiveMs)||!Number.isSafeInteger(e.knownAtMs)||
   e.effectiveMs<=e.knownAtMs||e.effectiveMs<=priorEffective||e.knownAtMs<=priorKnown||
   !Number.isFinite(e.spreadPoints)||!e.oldTicker||!e.newTicker||e.oldTicker===e.newTicker)
   throw Error("Invalid or noncausal rollover event");
  priorEffective=e.effectiveMs;priorKnown=e.knownAtMs;
 }
 for(let i=1;i<events.length;i++)
  if(events[i-1]!.newTicker!==events[i]!.oldTicker)throw Error("Broken contract chain");
}
export function cumulativeKnownOffset(events:readonly AdjustmentEvent[],asOfMs:number):number{
 validateCausalEvents(events);
 if(!Number.isSafeInteger(asOfMs))throw Error("Invalid as-of timestamp");
 return events.filter(e=>e.effectiveMs<=asOfMs).reduce((sum,e)=>sum+e.spreadPoints,0);
}
export function adjustedPointInTime(price:number,events:readonly AdjustmentEvent[],asOfMs:number):number{
 if(!Number.isFinite(price))throw Error("Invalid price");
 return price-cumulativeKnownOffset(events,asOfMs);
}
export function inspectOvernightCoverage(bars:readonly MinuteBar[],tradeDate:string){
 const target=Date.parse(tradeDate+"T00:00:00Z");
 if(!Number.isFinite(target)||new Date(target).toISOString().slice(0,10)!==tradeDate)
  throw Error("Invalid trade date");
 const prior=new Date(target-86400000).toISOString().slice(0,10);
 const selected=bars.filter(b=>{
  const c=newYorkClock(b.timestampMs),m=c.hour*60+c.minute;
  return (c.date===prior&&m>=1080)||(c.date===tradeDate&&m<570);
 }).sort((a,b)=>a.timestampMs-b.timestampMs);
 const expected:number[]=[];
 // Scan broad UTC bounds, using NY clock to account for DST.
 for(let t=target-2*86400000;t<target+86400000;t+=60000){
  const c=newYorkClock(t),m=c.hour*60+c.minute;
  if((c.date===prior&&m>=1080)||(c.date===tradeDate&&m<570))expected.push(t);
 }
 const present=new Set(selected.map(b=>b.timestampMs));
 const complete=expected.length>0&&selected.length===expected.length&&
  selected.every(b=>Number.isFinite(b.high)&&Number.isFinite(b.low))&&
  expected.every(t=>present.has(t));
 return {tradeDate,expectedMinutes:expected.length,observedMinutes:selected.length,
  missingMinutes:expected.filter(t=>!present.has(t)).length,
  status:complete?"COMPLETE" as const:"REVIEW_REQUIRED" as const,
  high:complete?Math.max(...selected.map(b=>b.high)):null,
  low:complete?Math.min(...selected.map(b=>b.low)):null};
}

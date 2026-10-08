import { newYorkClock } from "../market/time.js";
import type { MinuteBar } from "../market/types.js";

export interface RthCoverage {
 date:string; contractTicker:string; observedMinutes:number; missingMinutes:number;
 status:"COMPLETE"|"QUARANTINED";
 missingRanges:{startUtc:string;endUtc:string;minutes:number}[];
}
export function auditRthCoverage(bars:readonly MinuteBar[],date:string,contractTicker:string):RthCoverage {
 const start=Date.parse(date+"T00:00:00Z");
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(start)||
  new Date(start).toISOString().slice(0,10)!==date) throw new Error("Invalid date");
 const seen=new Set<number>();
 for(const b of bars) {
  const c=newYorkClock(b.timestampMs), minute=c.hour*60+c.minute;
  if(c.date!==date||minute<570||minute>=960) continue;
  if(b.contractTicker!==contractTicker||seen.has(b.timestampMs)) throw new Error("RTH identity/duplicate failure");
  seen.add(b.timestampMs);
 }
 // ET window calculated via a bounded UTC search; DST handled by newYorkClock.
 const expected:number[]=[];
 for(let t=start-6*3600000;t<start+30*3600000;t+=60000) {
  const c=newYorkClock(t),m=c.hour*60+c.minute;
  if(c.date===date&&m>=570&&m<960) expected.push(t);
 }
 if(expected.length!==390) throw new Error("RTH calendar not regular: "+date);
 const missing=expected.filter(t=>!seen.has(t));
 const ranges:{startUtc:string;endUtc:string;minutes:number}[]=[];
 for(const t of missing) {
  const last=ranges.at(-1);
  if(last&&Date.parse(last.endUtc)+60000===t) {last.endUtc=new Date(t).toISOString();last.minutes++;}
  else ranges.push({startUtc:new Date(t).toISOString(),endUtc:new Date(t).toISOString(),minutes:1});
 }
 return {date,contractTicker,observedMinutes:seen.size,missingMinutes:missing.length,
  status:missing.length?"QUARANTINED":"COMPLETE",missingRanges:ranges};
}

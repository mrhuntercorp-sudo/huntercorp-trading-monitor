import type { MinuteBar } from "../market/types.js";
import { inspectOvernightCoverage } from "./rollover-overnight-chain.js";
import { shiftResearchBars,rangeIntegrity } from "./rollover-signal-integrity.js";

export function assessAdjustedOvernight(
 bars:readonly MinuteBar[],tradeDate:string,offsetPoints:number,
 priorOldHigh:number,priorOldLow:number
){
 if(![offsetPoints,priorOldHigh,priorOldLow].every(Number.isFinite)||priorOldLow>priorOldHigh)
  throw Error("Invalid offset or reference range");
 const raw=inspectOvernightCoverage(bars,tradeDate);
 if(raw.status!=="COMPLETE")return {status:"REVIEW_REQUIRED" as const,
  reason:"INCOMPLETE_OVERNIGHT",coverage:raw};
 const target=Date.parse(tradeDate+"T00:00:00Z");
 const prior=new Date(target-86400000).toISOString().slice(0,10);
 const clock=new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York",
  year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
 const selected=bars.filter(b=>{
  const p=Object.fromEntries(clock.formatToParts(new Date(b.timestampMs)).map(x=>[x.type,x.value]));
  const date=p.year+"-"+p.month+"-"+p.day,m=Number(p.hour)*60+Number(p.minute);
  return (date===prior&&m>=1080)||(date===tradeDate&&m<570);
 }).sort((a,b)=>a.timestampMs-b.timestampMs);
 const adjusted=shiftResearchBars(selected,offsetPoints);
 const geometry=rangeIntegrity(selected,adjusted,offsetPoints);
 const high=Math.max(...adjusted.map(b=>b.high)),low=Math.min(...adjusted.map(b=>b.low));
 const eps=1e-7;
 const invariant=geometry.invariant&&Math.abs(high-(raw.high!-offsetPoints))<eps&&
  Math.abs(low-(raw.low!-offsetPoints))<eps;
 if(!invariant)throw Error("Overnight geometry invariant failed");
 return {status:"EVALUATED" as const,coverage:raw,offsetPoints,
  adjustedHigh:high,adjustedLow:low,geometryInvariant:invariant,
  priorOldHigh,priorOldLow,
  rawSweptPriorHigh:raw.high!>priorOldHigh,
  adjustedSweptPriorHigh:high>priorOldHigh,
  rawSweptPriorLow:raw.low!<priorOldLow,
  adjustedSweptPriorLow:low<priorOldLow,
  caveat:"Cross-contract comparison uses prior-old RTH levels; old-contract overnight comparison not established"};
}

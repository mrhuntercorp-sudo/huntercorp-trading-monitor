import type { MinuteBar } from "../market/types.js";
import { inspectOvernightCoverage } from "./rollover-overnight-chain.js";
import { newYorkClock } from "../market/time.js";

export function compareDualContractOvernight(oldBars:readonly MinuteBar[],newBars:readonly MinuteBar[],
 tradeDate:string,offsetPoints:number){
 if(!Number.isFinite(offsetPoints))throw Error("Invalid offset");
 const old=inspectOvernightCoverage(oldBars,tradeDate);
 const next=inspectOvernightCoverage(newBars,tradeDate);
 if(old.status!=="COMPLETE"||next.status!=="COMPLETE")
  return {status:"REVIEW_REQUIRED" as const,reason:"INCOMPLETE_DUAL_CONTRACT_OVERNIGHT",
   oldCoverage:old,newCoverage:next};
 const target=Date.parse(tradeDate+"T00:00:00Z");
 const prior=new Date(target-86400000).toISOString().slice(0,10);
 const grid:number[]=[];
 for(let t=target-2*86400000;t<target+86400000;t+=60000){
  const c=newYorkClock(t),m=c.hour*60+c.minute;
  if((c.date===prior&&m>=1080)||(c.date===tradeDate&&m<570))grid.push(t);
 }
 const a=new Map(oldBars.map(b=>[b.timestampMs,b]));
 const b=new Map(newBars.map(x=>[x.timestampMs,x]));
 let maxAbsHighDifference=0,maxAbsLowDifference=0,sumAbsHighDifference=0,sumAbsLowDifference=0;
 let directionAgreement=0,comparedMoves=0,previousOld:MinuteBar|undefined,previousNew:MinuteBar|undefined;
 for(const t of grid){
  const x=a.get(t),y=b.get(t);
  if(!x||!y)throw Error("Complete coverage without aligned timestamps");
  const dh=Math.abs(x.high-(y.high-offsetPoints)),dl=Math.abs(x.low-(y.low-offsetPoints));
  maxAbsHighDifference=Math.max(maxAbsHighDifference,dh);
  maxAbsLowDifference=Math.max(maxAbsLowDifference,dl);
  sumAbsHighDifference+=dh;sumAbsLowDifference+=dl;
  if(previousOld&&previousNew){
   const oldMove=Math.sign(x.close-previousOld.close);
   const newMove=Math.sign(y.close-previousNew.close);
   if(oldMove===newMove)directionAgreement++;
   comparedMoves++;
  }
  previousOld=x;previousNew=y;
 }
 const n=grid.length;
 return {status:"EVALUATED" as const,tradeDate,minutesCompared:n,offsetPoints,
  oldHigh:old.high,oldLow:old.low,adjustedNewHigh:next.high!-offsetPoints,
  adjustedNewLow:next.low!-offsetPoints,
  highDifferencePoints:next.high!-offsetPoints-old.high!,
  lowDifferencePoints:next.low!-offsetPoints-old.low!,
  meanAbsoluteMinuteHighDifferencePoints:sumAbsHighDifference/n,
  meanAbsoluteMinuteLowDifferencePoints:sumAbsLowDifference/n,
  maxAbsoluteMinuteHighDifferencePoints:maxAbsHighDifference,
  maxAbsoluteMinuteLowDifferencePoints:maxAbsLowDifference,
  minuteCloseDirectionAgreement:comparedMoves?directionAgreement/comparedMoves:null,
  caveat:"Descriptive comparison only; fixed offset does not imply identical contract liquidity or executable prices"};
}

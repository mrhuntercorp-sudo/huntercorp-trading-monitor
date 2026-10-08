import type { MinuteBar } from "../market/types.js";

export function shiftResearchBars(bars:readonly MinuteBar[],offsetPoints:number):MinuteBar[]{
 if(!Number.isFinite(offsetPoints))throw Error("Invalid adjustment");
 return bars.map(b=>({...b,open:b.open-offsetPoints,high:b.high-offsetPoints,
  low:b.low-offsetPoints,close:b.close-offsetPoints}));
}
export function rangeIntegrity(original:readonly MinuteBar[],adjusted:readonly MinuteBar[],offsetPoints:number){
 if(!original.length||original.length!==adjusted.length)throw Error("Missing or mismatched bars");
 if(!Number.isFinite(offsetPoints))throw Error("Invalid adjustment");
 const eps=1e-7;
 const same=original.every((b,i)=>{
  const a=adjusted[i]!;
  return a.timestampMs===b.timestampMs&&a.contractTicker===b.contractTicker&&a.volume===b.volume&&
   Math.abs((b.high-b.low)-(a.high-a.low))<eps&&
   Math.abs((b.close-b.open)-(a.close-a.open))<eps&&
   Math.abs((b.close-offsetPoints)-a.close)<eps;
 });
 const first=original[0]!,firstAdjusted=adjusted[0]!;
 const oldHigh=Math.max(...original.map(b=>b.high)),oldLow=Math.min(...original.map(b=>b.low));
 const newHigh=Math.max(...adjusted.map(b=>b.high)),newLow=Math.min(...adjusted.map(b=>b.low));
 return {invariant:same&&Math.abs((oldHigh-oldLow)-(newHigh-newLow))<eps,
  openingRangeWidthOriginal:oldHigh-oldLow,openingRangeWidthAdjusted:newHigh-newLow,
  firstOpenOriginal:first.open,firstOpenAdjusted:firstAdjusted.open};
}
export function compareCrossBoundary(
 priorOldClose:number,priorNewClose:number,rollOldOpen:number,rollNewOpen:number
){
 const values=[priorOldClose,priorNewClose,rollOldOpen,rollNewOpen];
 if(values.some(v=>!Number.isFinite(v)))throw Error("Invalid price");
 const offset=priorNewClose-priorOldClose;
 const adjustedRollOpen=rollNewOpen-offset;
 return {offsetPoints:offset,rawGapPoints:rollNewOpen-priorOldClose,
  adjustedGapPoints:adjustedRollOpen-priorOldClose,
  oldContractGapPoints:rollOldOpen-priorOldClose,
  residualPoints:adjustedRollOpen-rollOldOpen,
  rawAbovePriorOldClose:rollNewOpen>priorOldClose,
  adjustedAbovePriorOldClose:adjustedRollOpen>priorOldClose,
  oldAbovePriorOldClose:rollOldOpen>priorOldClose};
}

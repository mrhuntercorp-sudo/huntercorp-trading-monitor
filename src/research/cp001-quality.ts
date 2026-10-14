/** CP001 diagnostic quality flags. Does not modify detection or imply profitability. */
import type {Cp001Bar,Cp001Flag} from "./cp001-flags.js";
import type {Cp001Shoulder} from "./cp001-shoulders.js";
export type Cp001Quality={pattern:string;breakoutIndex:number;flags:string[];metrics:Record<string,number|boolean>;review:"MANUAL_REVIEW_REQUIRED"};
const line=(bars:readonly Cp001Bar[],p:Cp001Shoulder,i:number)=>{
 const [a,b]=p.necklineAnchorIndices;
 const anchor=(k:number)=>p.pattern==="HEAD_AND_SHOULDERS"?bars[k]!.low:bars[k]!.high;
 return anchor(a)+(anchor(b)-anchor(a))*(i-a)/(b-a);
};
export function auditCp001Quality(bars:readonly Cp001Bar[],p:Cp001Flag|Cp001Shoulder):Cp001Quality{
 const flags:string[]=[];const metrics:Record<string,number|boolean>={};
 if("poleStartIndex" in p){
  const consolidation=bars.slice(p.flagStartIndex,p.breakoutIndex);
  const direction=p.pattern==="BULL_FLAG"?1:-1;
  const net=consolidation.at(-1)!.close-consolidation[0]!.open;
  const poleAbs=Math.abs(p.polePoints);
  const drift=direction*net/poleAbs;
  const oppositeBars=consolidation.filter(b=>direction*(b.close-b.open)<0).length;
  const sameBars=consolidation.filter(b=>direction*(b.close-b.open)>0).length;
  metrics.directionalDriftRatio=Number(drift.toFixed(3));
  metrics.oppositeColorBars=oppositeBars;
  metrics.sameColorBars=sameBars;
  metrics.retracementRatio=p.retracementRatio;
  if(drift>0)flags.push("CONSOLIDATION_DRIFTS_WITH_POLE");
  if(oppositeBars===0)flags.push("NO_COUNTERTREND_CANDLES");
  if(p.retracementRatio<.1)flags.push("VERY_SHALLOW_RETRACEMENT");
 }else{
  const inverted=p.pattern==="INVERSE_HEAD_AND_SHOULDERS";
  const broken=(i:number)=>inverted?bars[i]!.close>=line(bars,p,i)+.25:bars[i]!.close<=line(bars,p,i)-.25;
  const firstAfterRight=Array.from({length:p.breakoutIndex-p.rightIndex-1},(_,j)=>p.rightIndex+j+1).find(broken);
  const firstAfterConfirmed=Array.from({length:Math.max(0,p.breakoutIndex-p.rightIndex-3)},(_,j)=>p.rightIndex+3+j).find(broken);
  metrics.firstBreakAfterRightIndex=firstAfterRight??-1;
  metrics.firstBreakAfterRightConfirmationIndex=firstAfterConfirmed??-1;
  metrics.confirmationIndex=p.breakoutIndex;
  metrics.necklineAtConfirmation=Number(line(bars,p,p.breakoutIndex).toFixed(2));
  if(firstAfterRight!==undefined&&firstAfterRight<p.breakoutIndex)flags.push("EARLIER_BREAK_AFTER_RIGHT_PIVOT");
  if(firstAfterConfirmed!==undefined&&firstAfterConfirmed<p.breakoutIndex)flags.push("EARLIER_BREAK_AFTER_CONFIRMED_RIGHT_PIVOT");
  const priorBreakBetweenAnchors=Array.from({length:Math.max(0,p.rightIndex-p.necklineAnchorIndices[1]-1)},(_,j)=>p.necklineAnchorIndices[1]+1+j).some(broken);
  metrics.breakBetweenSecondNecklineAnchorAndRight=priorBreakBetweenAnchors;
  if(priorBreakBetweenAnchors)flags.push("NECKLINE_BROKEN_BEFORE_RIGHT_SHOULDER");
 }
 return {pattern:p.pattern,breakoutIndex:p.breakoutIndex,flags,metrics,review:"MANUAL_REVIEW_REQUIRED"};
}

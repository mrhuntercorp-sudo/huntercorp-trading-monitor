/** IS001 post-confirmation FVG feasibility only; NOT a fill or execution model.
 * Scan from first bar after FVG confirmation until 60 minutes or RTH end.
 * Invalidating swept liquidity level and touching FVG in same minute is ambiguous.
 */
import type {MinuteBar} from "../market/types.js";
import type {Is001Signal} from "./is001-signals.js";
export type Is001Feasibility={status:"TOUCH_BEFORE_INVALIDATION"|"INVALIDATED_BEFORE_TOUCH"|"SAME_BAR_AMBIGUOUS"|"NO_TOUCH_60M"|"NO_POST_SIGNAL_BARS";barsObserved:number;firstTouchMinutes:number|null;firstInvalidationMinutes:number|null;referenceEntryMidpoint:number;stopAtSweptLevel:number;indicativeRiskPoints:number;signalFvgSameBarAsMss:boolean};
export function auditIs001Feasibility(day:readonly MinuteBar[],s:Is001Signal):Is001Feasibility{
 const midpoint=(s.fvgLow+s.fvgHigh)/2;
 const stop=s.liquidityLevel;
 const risk=Math.abs(midpoint-stop);
 const start=s.fvgIndex+1;
 const base={referenceEntryMidpoint:midpoint,stopAtSweptLevel:stop,indicativeRiskPoints:Math.round(risk*100)/100,signalFvgSameBarAsMss:s.fvgIndex===s.mssIndex};
 if(start>=day.length)return {...base,status:"NO_POST_SIGNAL_BARS",barsObserved:0,firstTouchMinutes:null,firstInvalidationMinutes:null};
 let touch:null|number=null,invalid:null|number=null;
 const end=Math.min(day.length,start+60);
 for(let i=start;i<end;i++){
  const b=day[i]!;
  const overlaps=b.high>=s.fvgLow&&b.low<=s.fvgHigh;
  const breached=s.direction==="LONG"?b.low<=stop:b.high>=stop;
  if(overlaps&&touch===null)touch=i-start;
  if(breached&&invalid===null)invalid=i-start;
  if(overlaps&&breached)return {...base,status:"SAME_BAR_AMBIGUOUS",barsObserved:i-start+1,firstTouchMinutes:touch,firstInvalidationMinutes:invalid};
  if(breached)return {...base,status:"INVALIDATED_BEFORE_TOUCH",barsObserved:i-start+1,firstTouchMinutes:touch,firstInvalidationMinutes:invalid};
  if(overlaps)return {...base,status:"TOUCH_BEFORE_INVALIDATION",barsObserved:i-start+1,firstTouchMinutes:touch,firstInvalidationMinutes:invalid};
 }
 return {...base,status:"NO_TOUCH_60M",barsObserved:end-start,firstTouchMinutes:touch,firstInvalidationMinutes:invalid};
}

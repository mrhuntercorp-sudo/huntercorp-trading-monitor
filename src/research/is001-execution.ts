/** IS001 frozen midpoint-limit execution research, minute OHLC conservative assumptions.
 * Limit activates NEXT bar after FVG confirmation. Fixed 0.25-point stop buffer
 * beyond swept level; 60 bars to fill; 2 points total round-trip friction.
 * No favorable gap improvement, no target; close at RTH end.
 * Same-bar fill+stop is classified ambiguous, not credited as a trade.
 * No broker queue/partial fill modelling.
 */
import type {MinuteBar} from "../market/types.js";
import type {Is001Signal} from "./is001-signals.js";
export type Is001Execution={status:"UNFILLED"|"INVALIDATED_PRE_FILL"|"AMBIGUOUS_FILL_STOP"|"STOPPED"|"SESSION_END";entryPrice:number;stopPrice:number;initialRiskPoints:number;entryIndex:number|null;exitIndex:number|null;exitPrice:number|null;netPoints:number|null;barsHeld:number|null;fillWaitMinutes:number|null};
export function simulateIs001Execution(day:readonly MinuteBar[],s:Is001Signal):Is001Execution{
 const tick=.25,friction=2,sign=s.direction==="LONG"?1:-1;
 const entry=(s.fvgLow+s.fvgHigh)/2;
 // NQ ticks: midpoint rounded adversely (long up, short down).
 const price=sign===1?Math.ceil(entry/tick-1e-8)*tick:Math.floor(entry/tick+1e-8)*tick;
 const stop=s.liquidityLevel-sign*tick;
 const risk=sign*(price-stop);
 if(!Number.isFinite(risk)||risk<=0)throw Error("INVALID_RISK_GEOMETRY");
 const base={entryPrice:price,stopPrice:stop,initialRiskPoints:Math.round(risk*100)/100};
 const start=s.fvgIndex+1,end=Math.min(day.length,start+60);
 let filled:number|null=null;
 for(let i=start;i<end;i++){
  const b=day[i]!;
  const touch=sign===1?b.low<=price:b.high>=price;
  const invalid=sign===1?b.low<=stop:b.high>=stop;
  if(invalid&&touch)return {...base,status:"AMBIGUOUS_FILL_STOP",entryIndex:i,exitIndex:i,exitPrice:null,netPoints:null,barsHeld:null,fillWaitMinutes:i-start};
  if(invalid)return {...base,status:"INVALIDATED_PRE_FILL",entryIndex:null,exitIndex:null,exitPrice:null,netPoints:null,barsHeld:null,fillWaitMinutes:null};
  if(touch){filled=i;break;}
 }
 if(filled===null)return {...base,status:"UNFILLED",entryIndex:null,exitIndex:null,exitPrice:null,netPoints:null,barsHeld:null,fillWaitMinutes:null};
 for(let i=filled;i<day.length;i++){
  const b=day[i]!;
  const hit=sign===1?b.low<=stop:b.high>=stop;
  if(hit){
   // Entry bar was screened for stop collision; later gap stop uses adverse open.
   const exit=sign===1?Math.min(b.open,stop):Math.max(b.open,stop);
   return {...base,status:"STOPPED",entryIndex:filled,exitIndex:i,exitPrice:exit,netPoints:Math.round((sign*(exit-price)-friction)*100)/100,barsHeld:i-filled+1,fillWaitMinutes:filled-start};
  }
 }
 const i=day.length-1,exit=day[i]!.close;
 return {...base,status:"SESSION_END",entryIndex:filled,exitIndex:i,exitPrice:exit,netPoints:Math.round((sign*(exit-price)-friction)*100)/100,barsHeld:i-filled+1,fillWaitMinutes:filled-start};
}

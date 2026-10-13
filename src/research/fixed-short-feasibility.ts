/** Conservative OHLC feasibility simulator. NOT live execution. */
import type {MinuteBar} from "../market/types.js";
export type ExitReason="STOP"|"TARGET"|"TIME";
export interface ShortSimulation {entryIndex:number;exitIndex:number;entryPrice:number;exitPrice:number;reason:ExitReason;grossPoints:number;netPoints:number;ambiguousBar:boolean;}
export const FIXED_SHORT_RULES={stopPoints:40,targetPoints:40,maxBars:10,roundTripCostPoints:2} as const;
/** Next bar open, 10 complete bars, adverse stop priority, no same-day overlap. */
export function simulateFixedShort(day:readonly MinuteBar[],signalIndex:number):ShortSimulation|null{
 const {stopPoints,targetPoints,maxBars,roundTripCostPoints}=FIXED_SHORT_RULES;
 if(!Number.isSafeInteger(signalIndex)||signalIndex<0||signalIndex+maxBars>=day.length)return null;
 const entryIndex=signalIndex+1,entry=day[entryIndex]!.open;
 const stop=entry+stopPoints,target=entry-targetPoints;
 for(let i=entryIndex;i<entryIndex+maxBars;i++){
  const b=day[i]!;
  if(b.high<b.low||b.high<Math.max(b.open,b.close)||b.low>Math.min(b.open,b.close))throw Error("INVALID_BAR");
  // A gap through a stop at the start of a later candle fills at its open, not the stop.
  if(i>entryIndex&&b.open>=stop)return {entryIndex,exitIndex:i,entryPrice:entry,exitPrice:b.open,reason:"STOP",grossPoints:entry-b.open,netPoints:entry-b.open-roundTripCostPoints,ambiguousBar:false};
  if(i>entryIndex&&b.open<=target)return {entryIndex,exitIndex:i,entryPrice:entry,exitPrice:target,reason:"TARGET",grossPoints:entry-target,netPoints:entry-target-roundTripCostPoints,ambiguousBar:false};
  const hitStop=b.high>=stop,hitTarget=b.low<=target;
  if(hitStop)return {entryIndex,exitIndex:i,entryPrice:entry,exitPrice:stop,reason:"STOP",grossPoints:-stopPoints,netPoints:-stopPoints-roundTripCostPoints,ambiguousBar:hitTarget};
  if(hitTarget)return {entryIndex,exitIndex:i,entryPrice:entry,exitPrice:target,reason:"TARGET",grossPoints:targetPoints,netPoints:targetPoints-roundTripCostPoints,ambiguousBar:false};
 }
 const exitIndex=entryIndex+maxBars-1,exitPrice=day[exitIndex]!.close;
 return {entryIndex,exitIndex,entryPrice:entry,exitPrice,reason:"TIME",grossPoints:entry-exitPrice,netPoints:entry-exitPrice-roundTripCostPoints,ambiguousBar:false};
}

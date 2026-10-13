/** First same-candle wick sweep/rejection of an already-known level. Research only. */
import type {MinuteBar} from "../market/types.js";
import type {KnownLevel} from "./level-reclaim.js";
export interface WickRejection {
 kind:KnownLevel["kind"];levelPrice:number;barIndex:number;timestampMs:number;
 direction:"LONG"|"SHORT";depthPoints:number;closeInsidePoints:number;
}
/** A completed candle must wick strictly beyond the level and close strictly inside.
 * ORB levels cannot be used until the opening range has finished.
 * OHLC does not reveal intrabar path; this is not proof of liquidity being taken.
 */
export function firstWickRejection(day:readonly MinuteBar[],level:KnownLevel):WickRejection|null{
 for(let i=level.knownAtIndex;i<day.length;i++){
  const b=day[i]!;
  const swept=level.side==="HIGH"?b.high>level.price:b.low<level.price;
  const inside=level.side==="HIGH"?b.close<level.price:b.close>level.price;
  if(swept&&inside)return {
   kind:level.kind,levelPrice:level.price,barIndex:i,timestampMs:b.timestampMs,
   direction:level.side==="HIGH"?"SHORT":"LONG",
   depthPoints:level.side==="HIGH"?b.high-level.price:level.price-b.low,
   closeInsidePoints:Math.abs(b.close-level.price)
  };
 }
 return null;
}

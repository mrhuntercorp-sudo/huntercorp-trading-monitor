/** Causal RTH context snapshot at a completed one-minute bar. Research only. */
import type {MinuteBar} from "../market/types.js";
import type {KnownLevel} from "./level-reclaim.js";
export interface MarketContextSnapshot {
 timestampMs:number;index:number;close:number;vwap:number|null;distanceFromVwapPoints:number|null;
 trailingFiveRangePoints:number|null;trailingFiveNetPoints:number|null;
 nearestAboveKind:string|null;nearestAbovePoints:number|null;
 nearestBelowKind:string|null;nearestBelowPoints:number|null;
 openingFiveWidthPoints:number|null;observedBars:number;
}
/** The caller supplies RTH bars. No future bar or not-yet-known level is read. */
export function marketContextAt(day:readonly MinuteBar[],levels:readonly KnownLevel[],index:number):MarketContextSnapshot{
 if(!Number.isSafeInteger(index)||index<0||index>=day.length)throw Error("INVALID_CONTEXT_INDEX");
 const current=day[index]!;
 for(let i=0;i<=index;i++){
  const b=day[i]!;
  if(!Number.isFinite(b.volume)||b.volume<0||![b.high,b.low,b.close,b.open].every(Number.isFinite)||
   b.high<Math.max(b.open,b.close)||b.low>Math.min(b.open,b.close)||
   (i>0&&b.timestampMs<=day[i-1]!.timestampMs))throw Error("INVALID_CONTEXT_BARS");
 }
 const known=levels.filter(l=>l.knownAtIndex<=index);
 const above=[...known].filter(l=>l.price>current.close).sort((a,b)=>a.price-b.price)[0];
 const below=[...known].filter(l=>l.price<current.close).sort((a,b)=>b.price-a.price)[0];
 let weighted=0,volume=0;
 for(let i=0;i<=index;i++){const b=day[i]!;weighted+=((b.high+b.low+b.close)/3)*b.volume;volume+=b.volume;}
 const vwap=volume>0?weighted/volume:null;
 const five=index>=4?day.slice(index-4,index+1):null;
 const openingFive=index>=5?day.slice(0,5):null;
 const high=(xs:readonly MinuteBar[])=>Math.max(...xs.map(b=>b.high));
 const low=(xs:readonly MinuteBar[])=>Math.min(...xs.map(b=>b.low));
 return {
  timestampMs:current.timestampMs,index,close:current.close,vwap,
  distanceFromVwapPoints:vwap===null?null:current.close-vwap,
  trailingFiveRangePoints:five?high(five)-low(five):null,
  trailingFiveNetPoints:five?current.close-five[0]!.open:null,
  nearestAboveKind:above?.kind??null,nearestAbovePoints:above?above.price-current.close:null,
  nearestBelowKind:below?.kind??null,nearestBelowPoints:below?current.close-below.price:null,
  openingFiveWidthPoints:openingFive?high(openingFive)-low(openingFive):null,
  observedBars:index+1
 };
}

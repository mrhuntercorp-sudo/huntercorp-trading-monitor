/** Causal, deterministic level-reclaim observations. No trading or execution. */
import type {MinuteBar} from "../market/types.js";
import {newYorkClock} from "../market/time.js";
export type LevelKind="OVERNIGHT_HIGH"|"OVERNIGHT_LOW"|"ORB_5_HIGH"|"ORB_5_LOW"|"ORB_15_HIGH"|"ORB_15_LOW";
export interface KnownLevel {kind:LevelKind; price:number; knownAtIndex:number; side:"HIGH"|"LOW";}
export interface ReclaimEvent {kind:LevelKind; price:number; breakoutIndex:number; reclaimIndex:number; breakoutClose:number; reclaimClose:number; direction:"LONG"|"SHORT"; reclaimTimestampMs:number;}
const clock=(b:MinuteBar)=>{const c=newYorkClock(b.timestampMs);return c.hour*60+c.minute;};
export function rthBars(bars:readonly MinuteBar[],date:string):MinuteBar[]{
 return bars.filter(b=>newYorkClock(b.timestampMs).date===date&&clock(b)>=570&&clock(b)<960);
}
export function knownLevels(day:readonly MinuteBar[],overnight:readonly MinuteBar[]):KnownLevel[]{
 if(day.length<15||overnight.length===0)throw Error("INSUFFICIENT_LEVEL_DATA");
 const bounds=(bars:readonly MinuteBar[])=>({high:Math.max(...bars.map(b=>b.high)),low:Math.min(...bars.map(b=>b.low))});
 const on=bounds(overnight),five=bounds(day.slice(0,5)),fifteen=bounds(day.slice(0,15));
 return [
 {kind:"OVERNIGHT_HIGH",price:on.high,knownAtIndex:0,side:"HIGH"},
 {kind:"OVERNIGHT_LOW",price:on.low,knownAtIndex:0,side:"LOW"},
 {kind:"ORB_5_HIGH",price:five.high,knownAtIndex:5,side:"HIGH"},
 {kind:"ORB_5_LOW",price:five.low,knownAtIndex:5,side:"LOW"},
 {kind:"ORB_15_HIGH",price:fifteen.high,knownAtIndex:15,side:"HIGH"},
 {kind:"ORB_15_LOW",price:fifteen.low,knownAtIndex:15,side:"LOW"},
 ];
}
/** Emit first close back inside after first close beyond; never read bars after the emitted event. */
export function firstReclaim(day:readonly MinuteBar[],level:KnownLevel):ReclaimEvent|null{
 let breakoutIndex=-1;
 for(let i=level.knownAtIndex;i<day.length;i++){
  const b=day[i]!;
  const beyond=level.side==="HIGH"?b.close>level.price:b.close<level.price;
  if(breakoutIndex<0){if(beyond)breakoutIndex=i;continue;}
  if(!beyond)return {kind:level.kind,price:level.price,breakoutIndex,reclaimIndex:i,breakoutClose:day[breakoutIndex]!.close,reclaimClose:b.close,direction:level.side==="HIGH"?"SHORT":"LONG",reclaimTimestampMs:b.timestampMs};
 }
 return null;
}
export function forwardExcursion(day:readonly MinuteBar[],event:ReclaimEvent,horizon=10){
 if(!Number.isSafeInteger(horizon)||horizon<1)throw Error("INVALID_HORIZON");
 const future=day.slice(event.reclaimIndex+1,event.reclaimIndex+1+horizon);
 const favorable=(b:MinuteBar)=>event.direction==="LONG"?b.high-event.reclaimClose:event.reclaimClose-b.low;
 const adverse=(b:MinuteBar)=>event.direction==="LONG"?event.reclaimClose-b.low:b.high-event.reclaimClose;
 return {forwardBars:future.length,maxFavorablePoints:future.length?Math.max(0,...future.map(favorable)):null,maxAdversePoints:future.length?Math.max(0,...future.map(adverse)):null,closeMovePoints:future.length===horizon?(event.direction==="LONG"?1:-1)*(future[horizon-1]!.close-event.reclaimClose):null};
}

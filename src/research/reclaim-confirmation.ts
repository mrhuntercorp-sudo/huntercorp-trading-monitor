/** Causal research-only reclaim confirmation; never emits orders or approved alerts. */
import type {MinuteBar} from "../market/types.js";
import type {KnownLevel,ReclaimEvent} from "./level-reclaim.js";

export type ReclaimHoldStatus="PENDING"|"HELD"|"FAILED";
export interface ReclaimHoldObservation {
 status:ReclaimHoldStatus;
 observedBars:number;
 requiredBars:number;
 failedAtIndex:number|null;
}
/** A confirmation is only available after every required subsequent bar has closed.
 * A close strictly beyond the swept level again invalidates the reclaim.
 * A wick crossing the level is not a close-based failure.
 */
export function reclaimHold(
 day:readonly MinuteBar[],event:ReclaimEvent,requiredBars=2
):ReclaimHoldObservation{
 if(!Number.isSafeInteger(requiredBars)||requiredBars<1||requiredBars>30)throw Error("INVALID_CONFIRMATION_BARS");
 if(event.reclaimIndex<0||event.reclaimIndex>=day.length||day[event.reclaimIndex]!.timestampMs!==event.reclaimTimestampMs)throw Error("INVALID_RECLAIM_EVENT");
 const observed=Math.min(requiredBars,day.length-event.reclaimIndex-1);
 for(let j=1;j<=observed;j++){
  const index=event.reclaimIndex+j,b=day[index]!;
  const failed=event.direction==="LONG"?b.close<event.price:b.close>event.price;
  if(failed)return {status:"FAILED",observedBars:j,requiredBars,failedAtIndex:index};
 }
 return {status:observed===requiredBars?"HELD":"PENDING",observedBars:observed,requiredBars,failedAtIndex:null};
}
export interface OpposingLevelContext {
 nearestOpposingKind:string|null;
 nearestOpposingPrice:number|null;
 roomPoints:number|null;
}
/** Snapshot at the reclaim close: levels not yet known are excluded. */
export function opposingLevelRoom(event:ReclaimEvent,levels:readonly KnownLevel[]):OpposingLevelContext{
 const opposing=levels.filter(l=>l.knownAtIndex<=event.reclaimIndex&&
  (event.direction==="LONG"?l.price>event.reclaimClose:l.price<event.reclaimClose));
 const sorted=[...opposing].sort((a,b)=>Math.abs(a.price-event.reclaimClose)-Math.abs(b.price-event.reclaimClose));
 const nearest=sorted[0];
 return nearest?{nearestOpposingKind:nearest.kind,nearestOpposingPrice:nearest.price,roomPoints:Math.abs(nearest.price-event.reclaimClose)}:
 {nearestOpposingKind:null,nearestOpposingPrice:null,roomPoints:null};
}

/** TF001 fixed research exit: initial structure stop; trail on prior five COMPLETED bars.
 * No same-bar stop tightening; stop fills account for adverse opening gaps.
 * This is a conservative minute-OHLC simulation, not executable order routing.
 */
import type {MinuteBar} from "../market/types.js";
import type {Tf001Signal} from "./tf001-signals.js";
export type Tf001Exit={reason:"STOP"|"SESSION_END";exitTimeMs:number;exitPrice:number;netPoints:number;barsHeld:number;initialRiskPoints:number;finalStop:number};
export function simulateTf001Exit(day:readonly MinuteBar[],s:Tf001Signal,frictionPoints=2):Tf001Exit{
 if(!Number.isFinite(frictionPoints)||frictionPoints<0)throw Error("INVALID_FRICTION");
 const start=day.findIndex(b=>b.timestampMs===s.entryTimeMs);
 if(start<5||start>=day.length)throw Error("ENTRY_NOT_IN_SESSION");
 if(day[start]!.open!==s.entryPrice)throw Error("ENTRY_PRICE_MISMATCH");
 const sign=s.direction==="LONG"?1:-1;
 if(sign*(s.entryPrice-s.initialStop)<=0)throw Error("INVALID_INITIAL_STOP");
 let stop=s.initialStop;
 const done=(reason:Tf001Exit["reason"],index:number,price:number):Tf001Exit=>({reason,exitTimeMs:day[index]!.timestampMs,exitPrice:price,netPoints:Math.round((sign*(price-s.entryPrice)-frictionPoints)*100)/100,barsHeld:index-start+1,initialRiskPoints:Math.abs(s.entryPrice-s.initialStop),finalStop:stop});
 for(let i=start;i<day.length;i++){
  const b=day[i]!;
  if(i>start){
   const completed=day.slice(i-5,i);
   if(completed.length!==5)throw Error("INSUFFICIENT_TRAIL_HISTORY");
   const candidate=sign===1?Math.min(...completed.map(x=>x.low)):Math.max(...completed.map(x=>x.high));
   stop=sign===1?Math.max(stop,candidate):Math.min(stop,candidate);
  }
  const hit=sign===1?b.low<=stop:b.high>=stop;
  if(hit){const price=sign===1?Math.min(b.open,stop):Math.max(b.open,stop);return done("STOP",i,price);}
  if(i===day.length-1)return done("SESSION_END",i,b.close);
 }
 throw Error("EMPTY_SIMULATION");
}

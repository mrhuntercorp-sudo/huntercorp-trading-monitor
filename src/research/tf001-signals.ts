/** TF001 v1 research contract: causal 1m EMA trend/pullback signals; no orders or APIs.
 * EMA20/EMA50 use RTH closes only; warm-up from 09:30, no overnight seeding.
 * At most one signal per day, entry at next minute open, no post-signal filtering.
 */
import type {MinuteBar} from "../market/types.js";
import {newYorkClock} from "../market/time.js";
export type Tf001Signal={direction:"LONG"|"SHORT";signalTimeMs:number;entryTimeMs:number;entryPrice:number;initialStop:number;ema20:number;ema50:number};
const MIN=60_000;
export function detectTf001(bars:readonly MinuteBar[]):Tf001Signal|null{
 if(bars.length<52)return null;
 const first=newYorkClock(bars[0]!.timestampMs);
 if(first.hour!==9||first.minute!==30)throw Error("MISSING_RTH_OPEN");
 for(let i=0;i<bars.length;i++){
  const b=bars[i]!,t=newYorkClock(b.timestampMs);
  if(t.date!==first.date||t.hour*60+t.minute!==570+i||(i&&b.timestampMs-bars[i-1]!.timestampMs!==MIN))throw Error("NONCONTIGUOUS_RTH");
  if(![b.open,b.high,b.low,b.close].every(Number.isFinite)||b.low>Math.min(b.open,b.close)||b.high<Math.max(b.open,b.close))throw Error("INVALID_BAR");
 }
 let e20=bars[0]!.close,e50=bars[0]!.close;
 const ema20:number[]=[],ema50:number[]=[];
 for(const b of bars){e20+=(b.close-e20)*2/21;e50+=(b.close-e50)*2/51;ema20.push(e20);ema50.push(e50);}
 // 50-bar warm-up; entry signals 10:20-11:29 ET; 5 prior bars for pullback.
 for(let i=50;i+1<bars.length;i++){
  const minute=570+i;if(minute<620||minute>689)continue;
  const b=bars[i]!,prior=bars[i-1]!,fast=ema20[i]!,slow=ema50[i]!;
  const prevFast=ema20[i-1]!,prevSlow=ema50[i-1]!;
  const long=fast>slow&&prevFast>prevSlow&&fast>ema20[i-5]!&&b.close>fast&&b.close>prior.high&&bars.slice(i-5,i).some((x,j)=>x.low<=ema20[i-5+j]!);
  const short=fast<slow&&prevFast<prevSlow&&fast<ema20[i-5]!&&b.close<fast&&b.close<prior.low&&bars.slice(i-5,i).some((x,j)=>x.high>=ema20[i-5+j]!);
  if(!long&&!short)continue;
  const direction=long?"LONG":"SHORT",entry=bars[i+1]!.open;
  const lookback=bars.slice(i-5,i+1);
  const stop=long?Math.min(...lookback.map(x=>x.low)):Math.max(...lookback.map(x=>x.high));
  if(long?stop>=entry:stop<=entry)continue;
  return {direction,signalTimeMs:b.timestampMs,entryTimeMs:bars[i+1]!.timestampMs,entryPrice:entry,initialStop:stop,ema20:fast,ema50:slow};
 }
 return null;
}

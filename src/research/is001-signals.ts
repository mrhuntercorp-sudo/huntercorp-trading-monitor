/** IS001 strict, causal research pattern on complete NY RTH 1-minute bars.
 * Frozen conventions: prior 20-bar liquidity level; wick sweep + close reclaim;
 * confirmed 3-left/3-right swing structure known before sweep; MSS close within
 * 15 bars; same-direction 3-candle FVG within 10 bars of MSS, minimum 1 NQ tick.
 * First pattern/day, 09:50-11:30 sweep window. Signal on FVG completion;
 * NOT a limit-entry/fill or profitability claim.
 */
import type {MinuteBar} from "../market/types.js";
import {newYorkClock} from "../market/time.js";
export type Is001Signal={direction:"LONG"|"SHORT";sweepIndex:number;mssIndex:number;fvgIndex:number;signalTimeMs:number;liquidityLevel:number;structureLevel:number;fvgLow:number;fvgHigh:number};
export function detectIs001(day:readonly MinuteBar[]):Is001Signal|null{
 if(day.length<55)return null;
 const start=newYorkClock(day[0]!.timestampMs);
 if(start.hour!==9||start.minute!==30)throw Error("MISSING_RTH_OPEN");
 for(let i=0;i<day.length;i++){const b=day[i]!,c=newYorkClock(b.timestampMs);if(c.date!==start.date||c.hour*60+c.minute!==570+i||(i>0&&b.timestampMs-day[i-1]!.timestampMs!==60000))throw Error("INCOMPLETE_RTH");if(![b.open,b.high,b.low,b.close].every(Number.isFinite)||b.low>Math.min(b.open,b.close)||b.high<Math.max(b.open,b.close))throw Error("INVALID_BAR");}
 const tick=.25;
 // A pivot at k is only confirmed once bar k+3 closes.
 const pivotHigh=(k:number)=>k>=3&&k+3<day.length&&[1,2,3].every(d=>day[k]!.high>day[k-d]!.high&&day[k]!.high>day[k+d]!.high);
 const pivotLow=(k:number)=>k>=3&&k+3<day.length&&[1,2,3].every(d=>day[k]!.low<day[k-d]!.low&&day[k]!.low<day[k+d]!.low);
 for(let sweep=20;sweep<=120&&sweep<day.length-15;sweep++){
  const b=day[sweep]!,history=day.slice(sweep-20,sweep);
  const high=Math.max(...history.map(x=>x.high)),low=Math.min(...history.map(x=>x.low));
  const long=b.low<=low-tick&&b.close>low;
  const short=b.high>=high+tick&&b.close<high;
  if(!long&&!short)continue;
  for(const direction of (["LONG","SHORT"] as const)){
   if(direction==="LONG"&&!long||direction==="SHORT"&&!short)continue;
   const pivots:number[]=[];
   for(let k=3;k+3<sweep;k++)if(direction==="LONG"?pivotHigh(k):pivotLow(k))pivots.push(k);
   if(!pivots.length)continue;
   const structure=direction==="LONG"?day[pivots[pivots.length-1]!]!.high:day[pivots[pivots.length-1]!]!.low;
   for(let m=sweep+1;m<=sweep+15&&m<day.length;m++){
    const shift=direction==="LONG"?day[m]!.close>=structure+tick:day[m]!.close<=structure-tick;
    if(!shift)continue;
    for(let f=m;f<=m+10&&f<day.length;f++){
     if(f<2)continue;
     const first=day[f-2]!,third=day[f]!;
     const gap=direction==="LONG"?third.low-first.high:first.low-third.high;
     if(gap<tick)continue;
     return {direction,sweepIndex:sweep,mssIndex:m,fvgIndex:f,signalTimeMs:third.timestampMs+60000,liquidityLevel:direction==="LONG"?low:high,structureLevel:structure,fvgLow:direction==="LONG"?first.high:third.high,fvgHigh:direction==="LONG"?third.low:first.low};
    }
    break;
   }
  }
 }
 return null;
}

/** TM001 P3 exploratory NQ signal families. Pure, deterministic, research-only. */
export type P3Bar={timestampMs:number;open:number;high:number;low:number;close:number};
export type P3Signal={strategy:"ON_SWEEP_RECLAIM_V1"|"ORB_RETEST_V1";direction:"LONG"|"SHORT";signalTime:number;entryTime:number;entryPrice:number;referenceLevel:number};
function valid(b:P3Bar){return Number.isFinite(b.timestampMs)&&[b.open,b.high,b.low,b.close].every(Number.isFinite)&&b.high>=Math.max(b.open,b.close,b.low)&&b.low<=Math.min(b.open,b.close,b.high);}
function check(bars:P3Bar[]){for(let i=0;i<bars.length;i++){if(!valid(bars[i]!)||(i>0&&bars[i]!.timestampMs<=bars[i-1]!.timestampMs))throw Error("INVALID_OR_UNORDERED_BARS");}}
/** One signal per side/day; no intrabar entry. Overnight levels must be from bars completed BEFORE RTH. */
export function overnightSweepReclaims(rth:P3Bar[],overnightHigh:number,overnightLow:number):P3Signal[]{
 check(rth);if(!Number.isFinite(overnightHigh)||!Number.isFinite(overnightLow)||overnightHigh<=overnightLow)throw Error("INVALID_OVERNIGHT_LEVELS");
 const out:P3Signal[]=[],seen=new Set<string>();
 for(let i=0;i+1<rth.length;i++){const b=rth[i]!,next=rth[i+1]!;
  const dir=b.high>overnightHigh&&b.close<overnightHigh?"SHORT":b.low<overnightLow&&b.close>overnightLow?"LONG":null;
  if(dir&&!seen.has(dir)){seen.add(dir);out.push({strategy:"ON_SWEEP_RECLAIM_V1",direction:dir,signalTime:b.timestampMs,entryTime:next.timestampMs,entryPrice:next.open,referenceLevel:dir==="SHORT"?overnightHigh:overnightLow});}
 }return out;
}
/** Opening 5 completed one-minute bars define OR. Later close outside OR arms a retest.
 * Retest must occur on a SUBSEQUENT completed bar and close back on breakout side.
 * Entry is following bar open; one signal/day; no hindsight selection.
 */
export function openingRangeBreakoutRetest(rth:P3Bar[]):P3Signal[]{
 check(rth);if(rth.length<8)return [];
 const opening=rth.slice(0,5),hi=Math.max(...opening.map(b=>b.high)),lo=Math.min(...opening.map(b=>b.low));
 let armed:{dir:"LONG"|"SHORT";level:number;index:number}|null=null;
 for(let i=5;i+1<rth.length;i++){const b=rth[i]!,next=rth[i+1]!;
  if(armed&&i>armed.index){
   const confirmed=armed.dir==="LONG"?b.low<=armed.level&&b.close>armed.level:b.high>=armed.level&&b.close<armed.level;
   if(confirmed)return [{strategy:"ORB_RETEST_V1",direction:armed.dir,signalTime:b.timestampMs,entryTime:next.timestampMs,entryPrice:next.open,referenceLevel:armed.level}];
   // If the retest closes on the wrong side, invalidate and wait for a new breakout.
   if(armed.dir==="LONG"?b.close<=armed.level:b.close>=armed.level)armed=null;
  }
  if(!armed){if(b.close>hi)armed={dir:"LONG",level:hi,index:i};else if(b.close<lo)armed={dir:"SHORT",level:lo,index:i};}
 }return [];
}

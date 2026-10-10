/** TM001 P4b: research-only, pure signal generation. No market-data imports or orders. */
import type { P3Bar } from "./p3-nq-signals.js";
export type P4Strategy="SESSION_TREND_PULLBACK_V1"|"VOLATILITY_COMPRESSION_EXPANSION_V1"|"OPENING_DRIVE_FAILURE_V1"|"LOW_TREND_MEAN_REVERSION_V1";
export type P4Direction="LONG"|"SHORT";
export type P4Signal={strategy:P4Strategy;direction:P4Direction;signalTime:number;entryTime:number;entryPrice:number;stopPrice:number;targetPrice:number;timeExitMs:number};
export type P4Session={bars:readonly P3Bar[];contractVerified:boolean;calendarVerified:boolean};
const MIN=60_000, TICK=.25;
const clock=new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",hour:"2-digit",minute:"2-digit",hourCycle:"h23",year:"numeric",month:"2-digit",day:"2-digit"});
function parts(ms:number){const p=Object.fromEntries(clock.formatToParts(new Date(ms)).map(x=>[x.type,x.value]));return {date:`${p.year}-${p.month}-${p.day}`,minute:Number(p.hour)*60+Number(p.minute)};}
function tick(v:number){return Number.isFinite(v)&&Math.abs(v/TICK-Math.round(v/TICK))<1e-7;}
function check(s:P4Session){if(!s.contractVerified||!s.calendarVerified)throw Error("UNVERIFIED_CONTRACT_OR_CALENDAR");
 const b=s.bars;if(!b.length)return;
 const first=parts(b[0]!.timestampMs);if(first.minute!==570)throw Error("MISSING_RTH_OPEN");
 for(let i=0;i<b.length;i++){const x=b[i]!;if(!Number.isSafeInteger(x.timestampMs)||![x.open,x.high,x.low,x.close].every(tick)||x.high<Math.max(x.open,x.close,x.low)||x.low>Math.min(x.open,x.close,x.high))throw Error("INVALID_BAR");
  const t=parts(x.timestampMs);if(t.date!==first.date||t.minute!==570+i||t.minute>=960||(i>0&&x.timestampMs-b[i-1]!.timestampMs!==MIN))throw Error("GAP_OR_SESSION_BOUNDARY");
 }
}
function signal(strategy:P4Strategy,dir:P4Direction,b:readonly P3Bar[],i:number):P4Signal|null{
 const next=b[i+1];if(!next)return null;
 const entry=next.open,stop=entry+(dir==="LONG"?-10:10),target=entry+(dir==="LONG"?40:-40);
 // Signal bar is complete at the next bar's timestamp; only the next bar's open is an assumed fill.
 return {strategy,direction:dir,signalTime:b[i]!.timestampMs,entryTime:next.timestampMs,entryPrice:entry,stopPrice:stop,targetPrice:target,timeExitMs:Math.min(next.timestampMs+30*MIN, b[0]!.timestampMs+385*MIN)};
}
function allowed(b:readonly P3Bar[],i:number,from:number,to:number){const t=parts(b[i]!.timestampMs).minute;return t>=from&&t<=to&&t<945&&i+1<b.length&&parts(b[i+1]!.timestampMs).minute<960;}
function mean(xs:number[]){return xs.reduce((a,b)=>a+b,0)/xs.length;}
export function generateP4Signals(s:P4Session,strategy:P4Strategy):P4Signal[]{
 check(s);const b=s.bars;if(!b.length)return [];
 for(let i=0;i+1<b.length;i++){
  let dir:P4Direction|null=null;
  if(strategy==="SESSION_TREND_PULLBACK_V1"){
   if(i<20||!allowed(b,i,600,870))continue;
   const impulse=b[i-4]!.close-b[i-9]!.open, pull=b[i-1]!.close-b[i-3]!.close;
   const anchor=b[i-9]!.open;
   const long=impulse>=30&&pull<=-8&&b.slice(i-3,i).every(x=>x.close>=anchor)&&b[i]!.close>b[i-1]!.high;
   const short=impulse<=-30&&pull>=8&&b.slice(i-3,i).every(x=>x.close<=anchor)&&b[i]!.close<b[i-1]!.low;
   dir=long&&!short?"LONG":short&&!long?"SHORT":null;
  }else if(strategy==="VOLATILITY_COMPRESSION_EXPANSION_V1"){
   if(i<12||!allowed(b,i,600,870))continue;
   const prior=b.slice(i-12,i),hi=Math.max(...prior.map(x=>x.high)),lo=Math.min(...prior.map(x=>x.low));
   if(hi-lo>20||prior.some(x=>x.high-x.low>8)||b[i]!.high-b[i]!.low>20)continue;
   const long=b[i]!.close>hi+2,short=b[i]!.close<lo-2;
   dir=long&&!short?"LONG":short&&!long?"SHORT":null;
   if(dir&&((dir==="LONG"&&b[i+1]!.open-b[i]!.close>5)||(dir==="SHORT"&&b[i]!.close-b[i+1]!.open>5)))dir=null;
  }else if(strategy==="OPENING_DRIVE_FAILURE_V1"){
   if(i<10||!allowed(b,i,580,630))continue;
   const drive=b[9]!.close-b[0]!.open,mid=(b[9]!.close+b[0]!.open)/2;
   if(drive>=30&&b[i]!.close<mid&&b[i]!.close<b[i-1]!.low)dir="SHORT";
   else if(drive<=-30&&b[i]!.close>mid&&b[i]!.close>b[i-1]!.high)dir="LONG";
  }else if(strategy==="LOW_TREND_MEAN_REVERSION_V1"){
   if(i<31||!allowed(b,i,660,870))continue;
   const closes=b.slice(i-30,i).map(x=>x.close), center=mean(closes);
   const variance=closes.reduce((a,x)=>a+(x-center)**2,0)/29,sigma=Math.sqrt(variance);
   let travel=0;for(let k=i-29;k<i;k++)travel+=Math.abs(b[k]!.close-b[k-1]!.close);
   if(travel===0||Math.abs(b[i-1]!.close-b[i-30]!.close)/travel>.25||sigma<2)continue;
   if(b[i]!.close<=center-2*sigma&&b[i]!.close>b[i]!.open)dir="LONG";
   else if(b[i]!.close>=center+2*sigma&&b[i]!.close<b[i]!.open)dir="SHORT";
  }else throw Error("UNKNOWN_STRATEGY");
  if(dir){const x=signal(strategy,dir,b,i);return x?[x]:[];}
 }
 return [];
}

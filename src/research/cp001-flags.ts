/** CP001 V1 causal 5-minute bull/bear flag detector. Research only.
 * Fixed baseline: 3-bar pole >= 35 NQ points; 3-8 completed consolidation bars,
 * <= 60% pole retracement; consolidation net slope counter-trend or flat;
 * 5-minute close breaks prior consolidation boundary by >= 1 tick.
 * No future bars needed to recognize a completed breakout.
 */
import type {MinuteBar} from "../market/types.js";
export type Cp001Bar={timestampMs:number;open:number;high:number;low:number;close:number};
export type Cp001Flag={pattern:"BULL_FLAG"|"BEAR_FLAG";poleStartIndex:number;poleEndIndex:number;flagStartIndex:number;breakoutIndex:number;breakoutTimeMs:number;polePoints:number;retracementRatio:number;consolidationBars:number;breakoutLevel:number};
export function aggregateCp001FiveMinute(day:readonly MinuteBar[]):Cp001Bar[]{
 if(day.length%5!==0)throw Error("INCOMPLETE_FIVE_MINUTE_GROUP");
 const out:Cp001Bar[]=[];
 for(let i=0;i<day.length;i+=5){
  const five=day.slice(i,i+5);
  if(five.length!==5||five.some((b,j)=>j>0&&b.timestampMs-five[j-1]!.timestampMs!==60000))throw Error("DISCONTINUOUS_MINUTE_BARS");
  out.push({timestampMs:five[0]!.timestampMs,open:five[0]!.open,high:Math.max(...five.map(b=>b.high)),low:Math.min(...five.map(b=>b.low)),close:five[4]!.close});
 }
 return out;
}
export function detectCp001Flags(bars:readonly Cp001Bar[]):Cp001Flag[]{
 const found:Cp001Flag[]=[];const tick=.25;
 // First 5-minute candle closes at 09:35 ET; scans causal RTH-only bars.
 for(let breakout=6;breakout<bars.length;breakout++){
  let selected:Cp001Flag|null=null;
  for(let flagBars=3;flagBars<=8&&!selected;flagBars++){
   const poleEnd=breakout-flagBars-1,poleStart=poleEnd-2,flagStart=poleEnd+1;
   if(poleStart<0)continue;
   const pole=bars[poleEnd]!.close-bars[poleStart]!.open;
   if(Math.abs(pole)<35)continue;
   const direction=pole>0?1:-1;
   const flag=bars.slice(flagStart,breakout);
   const poleRange=Math.abs(pole);
   const maxRetrace=direction===1?bars[poleEnd]!.close-Math.min(...flag.map(b=>b.low)):Math.max(...flag.map(b=>b.high))-bars[poleEnd]!.close;
   const ratio=Math.max(0,maxRetrace)/poleRange;
   if(ratio>0.6)continue;
   const netSlope=flag[flag.length-1]!.close-flag[0]!.open;
   if(direction*netSlope>poleRange*.1)continue;
   const high=Math.max(...flag.map(b=>b.high)),low=Math.min(...flag.map(b=>b.low));
   const boundary=direction===1?high:low;
   const close=bars[breakout]!.close;
   if(direction===1?close<boundary+tick:close>boundary-tick)continue;
   // Prevent classifying a breakout candle as the first expansion when it is still inside pole range.
   if(direction===1?close<=bars[poleEnd]!.close:close>=bars[poleEnd]!.close)continue;
   selected={pattern:direction===1?"BULL_FLAG":"BEAR_FLAG",poleStartIndex:poleStart,poleEndIndex:poleEnd,flagStartIndex:flagStart,breakoutIndex:breakout,breakoutTimeMs:bars[breakout]!.timestampMs+300000,polePoints:Math.round(pole*100)/100,retracementRatio:Math.round(ratio*1000)/1000,consolidationBars:flagBars,breakoutLevel:boundary};
  }
  if(selected)found.push(selected);
 }
 return found;
}

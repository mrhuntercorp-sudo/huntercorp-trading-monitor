/** CP001 causal confirmed 5-minute head-and-shoulders family.
 * Fixed baseline: 2-left/2-right swing confirmation; alternating
 * peak-trough-peak-trough-peak (or inverse), head >= 10 points beyond
 * shoulders; shoulder mismatch <= 35% of head height; neckline slope
 * permitted; close breaks interpolated neckline >= 0.25 within 12 bars.
 * First confirmed break per unique right shoulder, no future pivot knowledge.
 */
import type {Cp001Bar} from "./cp001-flags.js";
export type Cp001Shoulder={pattern:"HEAD_AND_SHOULDERS"|"INVERSE_HEAD_AND_SHOULDERS";leftIndex:number;headIndex:number;rightIndex:number;necklineAnchorIndices:[number,number];breakoutIndex:number;breakoutTimeMs:number;necklineAtBreak:number;headExcessPoints:number;shoulderDifferencePoints:number};
type Pivot={index:number;kind:"HIGH"|"LOW";price:number};
export function detectCp001Shoulders(bars:readonly Cp001Bar[]):Cp001Shoulder[]{
 const pivots:Pivot[]=[];const out:Cp001Shoulder[]=[];const seen=new Set<string>();
 const tick=.25;
 const interpolate=(a:Pivot,b:Pivot,index:number)=>a.price+(b.price-a.price)*(index-a.index)/(b.index-a.index);
 for(let i=4;i<bars.length;i++){
  // A pivot at i-2 becomes known only after the current candle i closes.
  const k=i-2,b=bars[k]!;
  const hi=[1,2].every(d=>b.high>bars[k-d]!.high&&b.high>bars[k+d]!.high);
  const lo=[1,2].every(d=>b.low<bars[k-d]!.low&&b.low<bars[k+d]!.low);
  if(hi)pivots.push({index:k,kind:"HIGH",price:b.high});
  if(lo)pivots.push({index:k,kind:"LOW",price:b.low});
  // A breakout must happen AFTER right shoulder pivot has been confirmed.
  for(const inverted of [false,true]){
   const kinds=inverted?["LOW","HIGH","LOW","HIGH","LOW"]:["HIGH","LOW","HIGH","LOW","HIGH"];
   const candidates=pivots.filter(p=>p.kind===kinds[0]&&p.index<=i-2);
   for(let r=candidates.length-1;r>=0;r--){
    const right=candidates[r]!;
    if(i<=right.index+2||i>right.index+12)continue;
    const key=(inverted?"I":"H")+":"+right.index;
    if(seen.has(key))continue;
    const before=pivots.filter(p=>p.index<right.index);
    // Select the four most recent alternating pivots, skipping same-type repeats.
    const chosen:Pivot[]=[right];let prior=right.index;
    for(let j=3;j>=0;j--){
     const target=kinds[j]!;
     const matches=before.filter(p=>p.index<prior&&p.kind===target);
     if(!matches.length)break;
     const selected=matches[matches.length-1]!;
     chosen.unshift(selected);prior=selected.index;
    }
    if(chosen.length!==5)continue;
    const [left,n1,head,n2]=chosen;
    if(!(left!.index<n1!.index&&n1!.index<head!.index&&head!.index<n2!.index&&n2!.index<right.index))continue;
    if(right.index-left!.index>40||right.index-left!.index<8)continue;
    const headExcess=inverted?Math.min(left!.price,right.price)-head!.price:head!.price-Math.max(left!.price,right.price);
    if(headExcess<10)continue;
    const shoulderDiff=Math.abs(left!.price-right.price);
    if(shoulderDiff>headExcess*.35)continue;
    const neckline=interpolate(n1!,n2!,i);
    const close=bars[i]!.close;
    const broken=inverted?close>=neckline+tick:close<=neckline-tick;
    if(!broken)continue;
    // Breakout should cross neckline now, not have been below/above it earlier.
    const priorLine=interpolate(n1!,n2!,i-1);
    const priorClose=bars[i-1]!.close;
    if(inverted?priorClose>priorLine:priorClose<priorLine)continue;
    seen.add(key);
    out.push({pattern:inverted?"INVERSE_HEAD_AND_SHOULDERS":"HEAD_AND_SHOULDERS",leftIndex:left!.index,headIndex:head!.index,rightIndex:right.index,necklineAnchorIndices:[n1!.index,n2!.index],breakoutIndex:i,breakoutTimeMs:bars[i]!.timestampMs+300000,necklineAtBreak:Math.round(neckline*100)/100,headExcessPoints:Math.round(headExcess*100)/100,shoulderDifferencePoints:Math.round(shoulderDiff*100)/100});
    break;
   }
  }
 }
 return out;
}

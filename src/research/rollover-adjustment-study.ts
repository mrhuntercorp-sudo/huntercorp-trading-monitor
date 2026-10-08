import type { MinuteBar } from "../market/types.js";

export interface RolloverAdjustmentResult {
 status:"EVALUATED"|"REVIEW_REQUIRED";
 reason:string;
 priorSpreadPoints?:number;
 rawCrossContractGapPoints?:number;
 adjustedCrossContractGapPoints?:number;
 sameContractOvernightGapPoints?:number;
 adjustedVsSameContractResidualPoints?:number;
}
export function assessForwardRolloverAdjustment(
 priorOld:readonly MinuteBar[],priorNew:readonly MinuteBar[],
 rollOld:readonly MinuteBar[],rollNew:readonly MinuteBar[]
):RolloverAdjustmentResult {
 const review=(reason:string):RolloverAdjustmentResult=>({status:"REVIEW_REQUIRED",reason});
 if([priorOld,priorNew,rollOld,rollNew].some(xs=>xs.length!==390))
  return review("INCOMPLETE_RTH_SESSION");
 const aligned=(a:readonly MinuteBar[],b:readonly MinuteBar[])=>a.every((x,i)=>
  x.timestampMs===b[i]?.timestampMs&&
  (i===0||x.timestampMs===a[i-1]!.timestampMs+60000));
 if(!aligned(priorOld,priorNew)||!aligned(rollOld,rollNew))
  return review("UNALIGNED_RTH_MINUTES");
 const pOld=priorOld.at(-1)!,pNew=priorNew.at(-1)!,rOld=rollOld[0]!,rNew=rollNew[0]!;
 if(pOld.timestampMs>=rOld.timestampMs||pNew.timestampMs>=rNew.timestampMs)
  return review("NONCAUSAL_DATE_ORDER");
 if(new Set([pOld.contractTicker,pNew.contractTicker,rOld.contractTicker,rNew.contractTicker]).size!==2||
  pOld.contractTicker!==rOld.contractTicker||pNew.contractTicker!==rNew.contractTicker||
  pOld.contractTicker===pNew.contractTicker)
  return review("CONTRACT_IDENTITY_MISMATCH");
 const prices=[pOld.close,pNew.close,rOld.open,rNew.open];
 if(prices.some(x=>!Number.isFinite(x)))return review("INVALID_PRICE");
 const round=(n:number)=>Math.round(n*10000)/10000;
 const priorSpread=pNew.close-pOld.close;
 const rawGap=rNew.open-pOld.close;
 const adjustedGap=rNew.open-priorSpread-pOld.close;
 const sameContractGap=rOld.open-pOld.close;
 return {status:"EVALUATED",reason:"PRIOR_COMPLETE_RTH_CLOSE_SPREAD_ONLY",
  priorSpreadPoints:round(priorSpread),
  rawCrossContractGapPoints:round(rawGap),
  adjustedCrossContractGapPoints:round(adjustedGap),
  sameContractOvernightGapPoints:round(sameContractGap),
  adjustedVsSameContractResidualPoints:round(adjustedGap-sameContractGap)};
}

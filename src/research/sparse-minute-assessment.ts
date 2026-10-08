export type SparseMinuteAssessment = {
 status:"COMPLETE"|"ISOLATED_SPARSE_REVIEW"|"SHARED_GAP_QUARANTINE";
 sharedMissingMinutes:number;
 reason:string;
};
/** Descriptive classification only; cannot prove zero trades or provider outage. */
export function assessSparseMinutes(
 septemberMissing:readonly number[],decemberMissing:readonly number[],
):SparseMinuteAssessment {
 const valid=(xs:readonly number[])=>xs.every(Number.isSafeInteger)&&xs.every(x=>x>=0)&&new Set(xs).size===xs.length;
 if(!valid(septemberMissing)||!valid(decemberMissing)) throw new Error("Invalid missing minute timestamps");
 const other=new Set(decemberMissing);
 const shared=septemberMissing.filter(t=>other.has(t)).length;
 if(shared>0) return {status:"SHARED_GAP_QUARANTINE",sharedMissingMinutes:shared,
  reason:"CROSS_CONTRACT_MISSING_MINUTES_UNRESOLVED"};
 if(septemberMissing.length||decemberMissing.length)
  return {status:"ISOLATED_SPARSE_REVIEW",sharedMissingMinutes:0,
   reason:"NO_TRADE_BARS_POSSIBLE_BUT_UNVERIFIED"};
 return {status:"COMPLETE",sharedMissingMinutes:0,reason:"NO_MISSING_RTH_MINUTES"};
}

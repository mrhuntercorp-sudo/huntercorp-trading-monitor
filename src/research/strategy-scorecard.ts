/** TM001 P2 scorecard contract. Research-only, no I/O or trading. */
export type FillMode="THRESHOLD_PROXY"|"WORST_BAR_STRESS";
export type ResearchStatus="REJECT"|"RESEARCH_MORE"|"OOS_ELIGIBLE"|"ALERT_ONLY_ELIGIBLE";
export type StrategyScorecard={
 strategyId:string;strategyVersion:string;position:"5_MNQ"|"1_NQ"|"2_NQ";mllUsd:2000|3000;fillMode:FillMode;
 candidateSessions:number;eligibleSessions:number;signals:number;executed:number;skipped:number;pretradeRejects:number;
 netUsd:number;maxClosedEquityDrawdownUsd:number;minimumModeledEodMllCushionUsd:number;minimumObservedWorstBarCushionUsd:number;
 stopTargetCollisionBars:number;stopRiskCollisionBars:number;gapThroughStopBars:number;gapThroughRiskBars:number;
 executionOrderUnresolved:boolean;firstMllTouch:string|null;firstOperatingStop:string|null;
 accountProfitTargetNotModeled:true;fillCertified:false;outOfSampleValidated:false;
 researchStatus:ResearchStatus;
};
export function validateScorecard(s:StrategyScorecard):string[]{
 const errors:string[]=[];
 if(!s.strategyId.trim()||!s.strategyVersion.trim())errors.push("STRATEGY_ID_VERSION_REQUIRED");
 for(const key of ["candidateSessions","eligibleSessions","signals","executed","skipped","pretradeRejects","stopTargetCollisionBars","stopRiskCollisionBars","gapThroughStopBars","gapThroughRiskBars"] as const){
  if(!Number.isSafeInteger(s[key])||s[key]<0)errors.push("INVALID_COUNT_"+key);
 }
 if(s.eligibleSessions>s.candidateSessions)errors.push("ELIGIBILITY_EXCEEDS_CANDIDATES");
 if(s.executed+s.skipped!==s.signals)errors.push("SIGNAL_ACCOUNTING_MISMATCH");
 if(s.pretradeRejects>s.skipped)errors.push("PRETRADE_REJECT_EXCEEDS_SKIPPED");
 for(const key of ["netUsd","maxClosedEquityDrawdownUsd","minimumModeledEodMllCushionUsd","minimumObservedWorstBarCushionUsd"] as const){
  if(!Number.isFinite(s[key]))errors.push("NONFINITE_"+key);
 }
 if(s.maxClosedEquityDrawdownUsd<0)errors.push("NEGATIVE_DRAWDOWN");
 if(s.fillCertified!==false||s.outOfSampleValidated!==false||s.accountProfitTargetNotModeled!==true)errors.push("UNSUPPORTED_CERTIFICATION");
 if(s.researchStatus==="ALERT_ONLY_ELIGIBLE"||s.researchStatus==="OOS_ELIGIBLE")errors.push("PREMATURE_PROMOTION");
 if((s.firstMllTouch!==null||s.firstOperatingStop!==null)&&s.researchStatus!=="REJECT")errors.push("RISK_HALT_MUST_REJECT");
 if(s.executionOrderUnresolved===false&&(s.stopTargetCollisionBars>0||s.stopRiskCollisionBars>0||s.gapThroughRiskBars>0||s.gapThroughStopBars>0))errors.push("UNCERTAINTY_FLAG_MISMATCH");
 return errors;
}

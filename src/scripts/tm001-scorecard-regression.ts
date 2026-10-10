import assert from "node:assert/strict";
import {validateScorecard,type StrategyScorecard} from "../research/strategy-scorecard.js";
const base:StrategyScorecard={
 strategyId:"TEST_ONLY",strategyVersion:"v0",position:"5_MNQ",mllUsd:2000,fillMode:"WORST_BAR_STRESS",
 candidateSessions:30,eligibleSessions:28,signals:10,executed:4,skipped:6,pretradeRejects:0,
 netUsd:-100,maxClosedEquityDrawdownUsd:100,minimumModeledEodMllCushionUsd:1900,minimumObservedWorstBarCushionUsd:1800,
 stopTargetCollisionBars:0,stopRiskCollisionBars:2,gapThroughStopBars:0,gapThroughRiskBars:0,executionOrderUnresolved:true,
 firstMllTouch:null,firstOperatingStop:null,accountProfitTargetNotModeled:true,fillCertified:false,outOfSampleValidated:false,researchStatus:"RESEARCH_MORE"
};
let n=0;function test(name:string,fn:()=>void){fn();n++;console.log("PASS "+name);}
test("VALID_RESEARCH_CARD",()=>assert.deepEqual(validateScorecard(base),[]));
test("REJECT_MISSING_ID",()=>assert.ok(validateScorecard({...base,strategyId:" "}).includes("STRATEGY_ID_VERSION_REQUIRED")));
test("REJECT_BAD_SIGNAL_ACCOUNTING",()=>assert.ok(validateScorecard({...base,skipped:5}).includes("SIGNAL_ACCOUNTING_MISMATCH")));
test("REJECT_NEGATIVE_COUNT",()=>assert.ok(validateScorecard({...base,executed:-1}).includes("INVALID_COUNT_executed")));
test("REJECT_ELIGIBILITY_OVERFLOW",()=>assert.ok(validateScorecard({...base,eligibleSessions:31}).includes("ELIGIBILITY_EXCEEDS_CANDIDATES")));
test("REJECT_NONFINITE_PNL",()=>assert.ok(validateScorecard({...base,netUsd:NaN}).includes("NONFINITE_netUsd")));
test("REJECT_UNCERTAINTY_HIDDEN",()=>assert.ok(validateScorecard({...base,executionOrderUnresolved:false}).includes("UNCERTAINTY_FLAG_MISMATCH")));
test("REJECT_PREMATURE_OOS",()=>assert.ok(validateScorecard({...base,researchStatus:"OOS_ELIGIBLE"}).includes("PREMATURE_PROMOTION")));
test("REJECT_PREMATURE_ALERTS",()=>assert.ok(validateScorecard({...base,researchStatus:"ALERT_ONLY_ELIGIBLE"}).includes("PREMATURE_PROMOTION")));
test("REJECT_MLL_HALT_PROMOTION",()=>assert.ok(validateScorecard({...base,firstMllTouch:"2026-08-24"}).includes("RISK_HALT_MUST_REJECT")));
test("REJECT_OPERATING_HALT_PROMOTION",()=>assert.ok(validateScorecard({...base,firstOperatingStop:"2026-08-24"}).includes("RISK_HALT_MUST_REJECT")));
test("ALLOW_EXPLICIT_REJECTION",()=>assert.deepEqual(validateScorecard({...base,firstMllTouch:"2026-08-24",researchStatus:"REJECT"}),[]));
console.log("TM001 SCORECARD REGRESSION GREEN "+n+"/"+n);
console.log("SCHEMA ONLY | NO API | NO CACHE | NO WRITES | NO TRADES | NOT CERTIFIED");

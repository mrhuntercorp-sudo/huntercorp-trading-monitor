import {generateP4Signals,type P4Strategy} from "../research/p4-nq-signals.js";
import {replayP4TradeRisk} from "../research/p4e-trade-risk-replay.js";
import {beginAccountDate,pretradeAccountDecision,rejectPretrade,settleAccountTrade,closeAccountSample,type AccountState} from "../research/p4e-account-state.js";
import {validateScorecard,type StrategyScorecard} from "../research/strategy-scorecard.js";
import { CachedHistoricalDays } from "../research/historical-cache.js";
import { auditRthCoverage } from "../research/rth-coverage.js";
import { overnightBars } from "../research/session-features.js";
import { newYorkClock } from "../market/time.js";

import type { MinuteBar } from "../market/types.js";

const stopPoints=process.env.TM001_STOP_POINTS==="40"?40:10;
if(process.env.TM001_STOP_POINTS!==undefined&&process.env.TM001_STOP_POINTS!=="10")throw Error("OOS1_FROZEN_STOP_MUST_BE_10");
console.log("=== TM001 OOS1 FROZEN TREND PULLBACK EVALUATION ===");
console.log("STOP_VARIANT "+JSON.stringify({stopPoints,targetPoints:40,baselineUnchanged:stopPoints===10,experimental:stopPoints===40}));
console.log("OOS1 OCT 05-09 | CACHE ONLY | ZERO API | ZERO WRITES | ZERO TRADES | RESEARCH PROXY");
const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("NETWORK_DISABLED");}});
const dates=["2026-10-05","2026-10-06","2026-10-07","2026-10-08","2026-10-09"];
const ms=(s:string)=>Date.parse(s+"T00:00:00Z"),iso=(t:number)=>new Date(t).toISOString().slice(0,10),dayMs=86400000;
const loaded=new Map<string,MinuteBar[]>();
async function load(ticker:string,date:string){const k=ticker+":"+date;if(!loaded.has(k))loaded.set(k,await cache.getDay({ticker,productCode:"NQ"},date));return loaded.get(k)!;}
const selected:MinuteBar[]=[],excluded:{date:string;reason:string}[]=[];
for(const date of dates){
 const ticker="NQZ6",prior=iso(ms(date)-dayMs);
 const bars=[...await load(ticker,prior),...await load(ticker,date)].sort((a,b)=>a.timestampMs-b.timestampMs);
 if(new Set(bars.map(b=>b.timestampMs)).size!==bars.length){excluded.push({date,reason:"DUPLICATE_TIMESTAMPS"});continue;}
 const rth=bars.filter(b=>{const c=newYorkClock(b.timestampMs),m=c.hour*60+c.minute;return c.date===date&&m>=570&&m<960;});
 const overnight=overnightBars(bars,date);
 
 if(auditRthCoverage(rth,date,ticker).status!=="COMPLETE"){excluded.push({date,reason:"INCOMPLETE_RTH"});continue;}
 if(overnight.length!==930||overnight.some((b,i)=>i>0&&b.timestampMs-overnight[i-1]!.timestampMs!==60000)){excluded.push({date,reason:"INCOMPLETE_OVERNIGHT"});continue;}
 selected.push(...rth);
}
const byDate=new Map<string,MinuteBar[]>();for(const b of selected){const d=newYorkClock(b.timestampMs).date;const arr=byDate.get(d)??[];arr.push(b);byDate.set(d,arr);}
console.log("ELIGIBILITY "+JSON.stringify({candidateDates:dates.length,eligibleSessions:byDate.size,excluded,contract:"NQZ6",lockedHoldout:true}));
console.log("RULE_ASSUMPTIONS "+JSON.stringify({startingBalanceUsd:50000,startingBalanceArbitrary:true,combineMllUsd:[2000,3000],mllTrailsEodBalance:true,mllFloorStopsAtStartingBalance:true,intradayUnrealizedEquityChecks:true,minuteBarWorstExtreme:true,commissionMnqRoundTripPerContractUsd:2,slippageTicksPerSide:3,dailyStopBudgetFractionOfMll:0.15,operatingDrawdownFractionOfMll:0.5,source:"NQ minute bars as MNQ price-path proxy",limitations:"minute-bar intrabar ordering unknown; extreme checked conservatively even on exit bar; no true orderbook/fills; account-specific Topstep rules unverified; profit target/consistency not modeled"}));
type Direction="LONG"|"SHORT";
type Signal={date:string;kind:P4Strategy;direction:Direction;entryTime:number;entry:number;stop:number;target:number;exitTime:number;exit:number;exitReason:string;ambiguous:boolean;entryMinuteExit:boolean};
const strategies=["SESSION_TREND_PULLBACK_V1"] as const;
const allSignals=new Map<P4Strategy,Signal[]>();
for(const strategy of strategies){
 const signals:Signal[]=[];
 for(const [date,bars] of byDate){
  const candidates=generateP4Signals({bars,contractVerified:true,calendarVerified:true},strategy,stopPoints);
  let availableFrom=0;
  for(const candidate of candidates.sort((a,b)=>a.entryTime-b.entryTime)){
   const i=bars.findIndex(b=>b.timestampMs===candidate.entryTime);
   if(i<availableFrom||i<0)continue;
   const entry=candidate.entryPrice,sign=candidate.direction==="LONG"?1:-1;
   const stop=candidate.stopPrice,target=candidate.targetPrice;
   let exit=entry,exitIndex=i,reason="TIME_EXIT",ambiguous=false;
   const deadline=Math.min(candidate.timeExitMs,bars.at(-1)!.timestampMs);
   for(let j=i;j<bars.length;j++){
    if(bars[j]!.timestampMs>=deadline){exit=bars[j]!.open;exitIndex=j;reason="TIME_EXIT";break;}
    if(j===bars.length-1){exit=bars[j]!.close;exitIndex=j;reason="SESSION_END";break;}
    const x=bars[j]!,stopHit=candidate.direction==="LONG"?x.low<=stop:x.high>=stop,targetHit=candidate.direction==="LONG"?x.high>=target:x.low<=target;
    if(stopHit){ambiguous=targetHit;exit=candidate.direction==="LONG"?Math.min(stop,x.open):Math.max(stop,x.open);exitIndex=j;reason="STOP";break;}
    if(targetHit){exit=target;exitIndex=j;reason="TARGET";break;}
   }
   signals.push({date,kind:strategy,direction:candidate.direction,entryTime:candidate.entryTime,entry,stop,target,exitTime:bars[exitIndex]!.timestampMs,exit,exitReason:reason,ambiguous,entryMinuteExit:exitIndex===i});
   availableFrom=bars.length; // P4a: maximum one executed trade per strategy per day.
  }
 }
 allSignals.set(strategy,signals);
 console.log("P4C_STRATEGY_SIGNALS "+JSON.stringify({strategy,signals:signals.length,eligibleSessions:byDate.size,stopPoints,targetPoints:40,entry:"next-bar-open",maxTradesPerDay:1,timeExitMinutes:30,entryMinuteExits:signals.filter(x=>x.entryMinuteExit).length,overlapSuppressed:true,outOfSampleFirstPass:true}));
}
// Legacy SCREEN output retired: non-authoritative friction and no account risk model.
const money=(n:number)=>Math.round(n*100)/100;
const sizes=[{label:"5_MNQ",usdPerPoint:10,commission:10,slippage:15},{label:"1_NQ",usdPerPoint:20,commission:5,slippage:30},{label:"2_NQ",usdPerPoint:40,commission:10,slippage:60}] as const;
for(const strategy of strategies){
const ordered=[...allSignals.get(strategy)!].sort((a,b)=>a.entryTime-b.entryTime);
console.log("INTEGRATED_ASSUMPTIONS "+JSON.stringify({signals:ordered.length,startingBalanceUsd:50000,startingBalanceIllustrative:true,positions:sizes,thresholdModes:["THRESHOLD_PROXY","WORST_BAR_STRESS"],dailyBudgetFractionOfMll:.15,operatingBudgetFractionOfMll:.5,operatingFloor:"EOD_HIGH_MINUS_HALF_MLL_INTERNAL_ONLY",mllFloor:"MIN(START,EOD_HIGH_MINUS_MLL)",dailyFloor:"DAY_START_MINUS_15_PERCENT_MLL",slippageTicksPerSide:3,commissionUnverified:true,limitations:"Minute OHLC cannot order target, stop and risk crossings within the same minute. Threshold proxy assumes execution exactly at limit; stress assumes worst bar extreme. Neither is a tradable fill prediction. Signal selection is independent of risk halts. First OOS holdout; no account certification."}));
for(const size of sizes)for(const mll of [2000,3000] as const)for(const mode of ["THRESHOLD_PROXY","WORST_BAR_STRESS"] as const){
 const start=50000,friction=size.commission+size.slippage;
 let state:AccountState={start,mll,balance:start,highEod:start,dayStart:start,currentDate:"",haltToday:false,firstMllTouch:null,firstOperatingStop:null};
 let executed=0,skipped=0,dailyCutoffDays=0,stopHits=0,targets=0,peak=start,maxClosedDrawdown=0,minCushion:number=mll,minObservedWorstBarCushion:number=mll,ambiguousRiskBars=0,stopTargetCollisionBars=0,stopRiskCollisionBars=0,gapThroughStopBars=0,gapThroughRiskBars=0,pretradeRejects=0;
 for(const t of ordered){
  state=beginAccountDate(state,t.date);
  const decision=pretradeAccountDecision(state);
  if(!decision.allowed){
   skipped++;
   if(decision.pretradeReject){pretradeRejects++;state=rejectPretrade(state);}
   continue;
  }
  const {levels,mllFloor,operatingFloor}=decision;
  const bars=byDate.get(t.date)!;
  const idx=bars.findIndex(b=>b.timestampMs===t.entryTime);
  if(idx<0)throw Error("MISSING_ENTRY "+t.date);
  const replay=replayP4TradeRisk({bars,entryIndex:idx,direction:t.direction,entry:t.entry,stop:t.stop,target:t.target,plannedExit:t.exit,plannedExitTime:t.exitTime,plannedExitReason:t.exitReason,balance:state.balance,friction,usdPerPoint:size.usdPerPoint,levels,mllFloor,mode});
  const {pnl,reason}=replay;
  minCushion=Math.min(minCushion,replay.minCushion);
  minObservedWorstBarCushion=Math.min(minObservedWorstBarCushion,replay.minObservedWorstBarCushion);
  ambiguousRiskBars+=replay.ambiguousRiskBars;
  stopTargetCollisionBars+=replay.stopTargetCollisionBars;
  stopRiskCollisionBars+=replay.stopRiskCollisionBars;
  gapThroughStopBars+=replay.gapThroughStopBars;
  gapThroughRiskBars+=replay.gapThroughRiskBars;
  state=settleAccountTrade(state,pnl,reason);executed++;
  peak=Math.max(peak,state.balance);maxClosedDrawdown=Math.max(maxClosedDrawdown,peak-state.balance);
  if(reason==="DAILY")dailyCutoffDays++;
  else if(reason==="STOP")stopHits++;
  else if(reason==="TARGET")targets++;
 }
 state=closeAccountSample(state);
 const scorecard:StrategyScorecard={
  strategyId:strategy,strategyVersion:"p4e-frozen-oos1-2026-10-05-through-09",
  position:size.label,mllUsd:mll,fillMode:mode,
  candidateSessions:dates.length,eligibleSessions:byDate.size,signals:ordered.length,executed,skipped,pretradeRejects,
  netUsd:money(state.balance-start),maxClosedEquityDrawdownUsd:money(maxClosedDrawdown),
  minimumModeledEodMllCushionUsd:money(minCushion),minimumObservedWorstBarCushionUsd:money(minObservedWorstBarCushion),
  stopTargetCollisionBars,stopRiskCollisionBars,gapThroughStopBars,gapThroughRiskBars,
  executionOrderUnresolved:ambiguousRiskBars>0,firstMllTouch:state.firstMllTouch,firstOperatingStop:state.firstOperatingStop,
  accountProfitTargetNotModeled:true,fillCertified:false,outOfSampleValidated:false,
  researchStatus:state.firstMllTouch||state.firstOperatingStop||state.balance<start?"REJECT":"RESEARCH_MORE"
 };
 const scorecardErrors=validateScorecard(scorecard);
 if(scorecardErrors.length)throw Error("SCORECARD_VALIDATION_FAILED "+JSON.stringify({position:size.label,mll,mode,errors:scorecardErrors}));
 console.log("STRATEGY_SCORECARD "+JSON.stringify(scorecard));
 console.log("INTEGRATED_SURVIVAL "+JSON.stringify({mode,position:size.label,mllUsd:mll,signalsAvailable:ordered.length,executed,skipped,pretradeRejects,netUsd:money(state.balance-start),maxClosedEquityDrawdownUsd:money(maxClosedDrawdown),minimumModeledIntradayCushionUsd:money(minCushion),minimumObservedWorstBarCushionUsd:money(minObservedWorstBarCushion),observedWorstBarCushionIsStressEnvelope:true,dailyCutoffDays,stopHits,targets,ambiguousRiskBars,stopTargetCollisionBars,stopRiskCollisionBars,gapThroughStopBars,gapThroughRiskBars,executionOrderUnresolved:ambiguousRiskBars>0,firstMllTouch:state.firstMllTouch,firstOperatingStop:state.firstOperatingStop,status:state.firstMllTouch?"MLL_TOUCH":state.firstOperatingStop?"OPERATING_STOP":"SURVIVED_SAMPLE",accountProfitTargetNotModeled:true}));
}
}
console.log("TM001 OOS1 FROZEN TREND PULLBACK SCREEN COMPLETE | CACHE ONLY | ZERO TRADES | INSUFFICIENT_EVIDENCE_IF_UNDER_30_TRADES | NOT CERTIFIED");

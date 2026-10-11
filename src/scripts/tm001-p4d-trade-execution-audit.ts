import {riskBarEligible,auditedExitTime,auditHoldingMinutes,exitAtDeadline} from "../research/p4e-execution-boundaries.js";
import {generateP4Signals,type P4Strategy} from "../research/p4-nq-signals.js";
import {validateScorecard,type StrategyScorecard} from "../research/strategy-scorecard.js";
import { CachedHistoricalDays } from "../research/historical-cache.js";
import { auditRthCoverage } from "../research/rth-coverage.js";
import { overnightBars } from "../research/session-features.js";
import { newYorkClock } from "../market/time.js";
import { provisionalClosedDates, provisionalNqContract, isProvisionalRoll } from "./massive-nq-calendar-policy.js";
import type { MinuteBar } from "../market/types.js";

console.log("=== TM001 P4d TRADE-LEVEL EXECUTION AUDIT ===");
console.log("CACHE ONLY | ZERO API | ZERO WRITES | ZERO TRADES | RESEARCH PROXY");
const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("NETWORK_DISABLED");}});
const ms=(s:string)=>Date.parse(s+"T00:00:00Z"),iso=(t:number)=>new Date(t).toISOString().slice(0,10),dayMs=86400000;
const dates:string[]=[];for(let t=ms("2026-10-02");dates.length<30;t-=dayMs){const d=iso(t),w=new Date(t).getUTCDay();if(w!==0&&w!==6&&!provisionalClosedDates.has(d))dates.push(d);}dates.reverse();
const loaded=new Map<string,MinuteBar[]>();
async function load(ticker:string,date:string){const k=ticker+":"+date;if(!loaded.has(k))loaded.set(k,await cache.getDay({ticker,productCode:"NQ"},date));return loaded.get(k)!;}
const selected:MinuteBar[]=[],excluded:{date:string;reason:string}[]=[];
for(const date of dates){
 const ticker=provisionalNqContract(date),prior=iso(ms(date)-dayMs);
 const bars=[...await load(ticker,prior),...await load(ticker,date)].sort((a,b)=>a.timestampMs-b.timestampMs);
 if(new Set(bars.map(b=>b.timestampMs)).size!==bars.length){excluded.push({date,reason:"DUPLICATE_TIMESTAMPS"});continue;}
 const rth=bars.filter(b=>{const c=newYorkClock(b.timestampMs),m=c.hour*60+c.minute;return c.date===date&&m>=570&&m<960;});
 const overnight=overnightBars(bars,date);
 if(isProvisionalRoll(date)){excluded.push({date,reason:"ROLLOVER_UNVERIFIED"});continue;}
 if(auditRthCoverage(rth,date,ticker).status!=="COMPLETE"){excluded.push({date,reason:"INCOMPLETE_RTH"});continue;}
 if(overnight.length!==930||overnight.some((b,i)=>i>0&&b.timestampMs-overnight[i-1]!.timestampMs!==60000)){excluded.push({date,reason:"INCOMPLETE_OVERNIGHT"});continue;}
 selected.push(...rth);
}
const byDate=new Map<string,MinuteBar[]>();for(const b of selected){const d=newYorkClock(b.timestampMs).date;const arr=byDate.get(d)??[];arr.push(b);byDate.set(d,arr);}
console.log("ELIGIBILITY "+JSON.stringify({candidateDates:dates.length,eligibleSessions:byDate.size,excluded,provisionalCalendarAndRoll:true}));
console.log("RULE_ASSUMPTIONS "+JSON.stringify({startingBalanceUsd:50000,startingBalanceArbitrary:true,combineMllUsd:[2000,3000],mllTrailsEodBalance:true,mllFloorStopsAtStartingBalance:true,intradayUnrealizedEquityChecks:true,minuteBarWorstExtreme:true,commissionMnqRoundTripPerContractUsd:2,slippageTicksPerSide:3,dailyStopBudgetFractionOfMll:0.15,operatingDrawdownFractionOfMll:0.5,source:"NQ minute bars as MNQ price-path proxy",limitations:"minute-bar intrabar ordering unknown; extreme checked conservatively even on exit bar; no true orderbook/fills; account-specific Topstep rules unverified; profit target/consistency not modeled"}));
type Direction="LONG"|"SHORT";
type Signal={date:string;kind:P4Strategy;direction:Direction;entryTime:number;entry:number;stop:number;target:number;exitTime:number;exit:number;exitReason:string;ambiguous:boolean;entryMinuteExit:boolean};
const strategies=["SESSION_TREND_PULLBACK_V1","VOLATILITY_COMPRESSION_EXPANSION_V1","OPENING_DRIVE_FAILURE_V1","LOW_TREND_MEAN_REVERSION_V1"] as const;
const allSignals=new Map<P4Strategy,Signal[]>();
for(const strategy of strategies){
 const signals:Signal[]=[];
 for(const [date,bars] of byDate){
  const candidates=generateP4Signals({bars,contractVerified:true,calendarVerified:true},strategy);
  let availableFrom=0;
  for(const candidate of candidates.sort((a,b)=>a.entryTime-b.entryTime)){
   const i=bars.findIndex(b=>b.timestampMs===candidate.entryTime);
   if(i<availableFrom||i<0)continue;
   const entry=candidate.entryPrice,sign=candidate.direction==="LONG"?1:-1;
   const stop=candidate.stopPrice,target=candidate.targetPrice;
   let exit=entry,exitIndex=i,reason="TIME_EXIT",ambiguous=false;
   const deadline=Math.min(candidate.timeExitMs,bars.at(-1)!.timestampMs);
   for(let j=i;j<bars.length;j++){
    if(exitAtDeadline(bars[j]!.timestampMs,deadline)){exit=bars[j]!.open;exitIndex=j;reason="TIME_EXIT";break;}
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
 console.log("P4C_STRATEGY_SIGNALS "+JSON.stringify({strategy,signals:signals.length,eligibleSessions:byDate.size,stopPoints:10,targetPoints:40,entry:"next-bar-open",maxTradesPerDay:1,timeExitMinutes:30,entryMinuteExits:signals.filter(x=>x.entryMinuteExit).length,overlapSuppressed:true,inSampleOnly:true}));
}
// Legacy SCREEN output retired: non-authoritative friction and no account risk model.
const money=(n:number)=>Math.round(n*100)/100;
const sizes=[{label:"5_MNQ",usdPerPoint:10,commission:10,slippage:15}] as const;
type Trigger="MLL"|"OPERATING"|"DAILY";
function crossing(entryEquity:number,adverseEquity:number,levels:{name:Trigger;level:number}[]){
 // Higher equity thresholds are encountered first on a monotonically adverse path.
 return levels.filter(x=>entryEquity>x.level&&adverseEquity<=x.level).sort((a,b)=>b.level-a.level)[0]??null;
}
for(const strategy of strategies){
const ordered=[...allSignals.get(strategy)!].sort((a,b)=>a.entryTime-b.entryTime);
console.log("INTEGRATED_ASSUMPTIONS "+JSON.stringify({signals:ordered.length,startingBalanceUsd:50000,startingBalanceIllustrative:true,positions:sizes,thresholdModes:["THRESHOLD_PROXY","WORST_BAR_STRESS"],dailyBudgetFractionOfMll:.15,operatingBudgetFractionOfMll:.5,operatingFloor:"EOD_HIGH_MINUS_HALF_MLL_INTERNAL_ONLY",mllFloor:"MIN(START,EOD_HIGH_MINUS_MLL)",dailyFloor:"DAY_START_MINUS_15_PERCENT_MLL",slippageTicksPerSide:3,commissionUnverified:true,limitations:"Minute OHLC cannot order target, stop and risk crossings within the same minute. Threshold proxy assumes execution exactly at limit; stress assumes worst bar extreme. Neither is a tradable fill prediction. Signal selection is independent of risk halts. In-sample only; no account certification."}));
for(const size of sizes)for(const mll of [3000] as const)for(const mode of ["THRESHOLD_PROXY","WORST_BAR_STRESS"] as const){
 const start=50000,friction=size.commission+size.slippage;
 let balance=start,highEod=start,dayStart=start,currentDate="",haltToday=false;
 let firstMllTouch:string|null=null,firstOperatingStop:string|null=null;
 const tradeAudit:{date:string;entryTime:string;exitTime:string;direction:Direction;entry:number;exit:number;exitReason:string;holdingMinutes:number;netUsd:number;entryMinuteExit:boolean;stopTargetCollision:boolean}[]=[];
 let executed=0,skipped=0,dailyCutoffDays=0,stopHits=0,targets=0,peak=start,maxClosedDrawdown=0,minCushion:number=mll,minObservedWorstBarCushion:number=mll,ambiguousRiskBars=0,stopTargetCollisionBars=0,stopRiskCollisionBars=0,gapThroughStopBars=0,gapThroughRiskBars=0,pretradeRejects=0;
 for(const t of ordered){
  if(t.date!==currentDate){
   if(currentDate)highEod=Math.max(highEod,balance);
   currentDate=t.date;dayStart=balance;haltToday=false;
  }
  if(firstMllTouch||firstOperatingStop||haltToday){skipped++;continue;}
  const mllFloor=Math.min(start,highEod-mll);
  const operatingFloor=highEod-mll*.5;
  const dailyFloor=dayStart-mll*.15;
  const levels:{name:Trigger;level:number}[]=[{name:"MLL",level:mllFloor},{name:"OPERATING",level:operatingFloor},{name:"DAILY",level:dailyFloor}];
  if(balance<=mllFloor||balance<=operatingFloor||balance<=dailyFloor){
   pretradeRejects++;skipped++;haltToday=true;
   if(balance<=mllFloor)firstMllTouch=t.date;
   else if(balance<=operatingFloor)firstOperatingStop=t.date;
   continue;
  }
  const bars=byDate.get(t.date)!;
  const idx=bars.findIndex(b=>b.timestampMs===t.entryTime);
  if(idx<0)throw Error("MISSING_ENTRY "+t.date);
  const sign=t.direction==="LONG"?1:-1;
  let exit=t.exit,reason=t.exitReason,actualExitTime=t.exitTime;
  const entryEquity=balance-friction;
  // Price risk is evaluated through the independent stop/target exit minute.
  // If the threshold and strategy exit share a bar, ordering is unknowable.
  for(const b of bars.slice(idx)){
   if(!riskBarEligible(b.timestampMs,t.exitTime,t.exitReason))break;
   const worst=t.direction==="LONG"?b.low:b.high;
   const adverseEquity=balance+(worst-t.entry)*sign*size.usdPerPoint-friction;
   // Observed bar extreme is a stress envelope, not necessarily reachable after an earlier modeled exit.
   minObservedWorstBarCushion=Math.min(minObservedWorstBarCushion,adverseEquity-mllFloor);
   const crossed=crossing(entryEquity,adverseEquity,levels);
   const modeledEquity=crossed&&mode==="THRESHOLD_PROXY"?crossed.level:adverseEquity;
   minCushion=Math.min(minCushion,modeledEquity-mllFloor);
   if(!crossed)continue;
   const stopTouched=t.direction==="LONG"?b.low<=t.stop:b.high>=t.stop;
   const targetTouched=t.direction==="LONG"?b.high>=t.target:b.low<=t.target;
   const stopTargetCollision=stopTouched&&targetTouched;
   const stopRiskCollision=stopTouched;
   const gapThroughStop=t.direction==="LONG"?b.open<=t.stop:b.open>=t.stop;
   const riskPrice=t.entry+(crossed.level-balance+friction)/(sign*size.usdPerPoint);
   const gapThroughRisk=t.direction==="LONG"?b.open<=riskPrice:b.open>=riskPrice;
   if(stopTargetCollision)stopTargetCollisionBars++;
   if(stopRiskCollision)stopRiskCollisionBars++;
   if(gapThroughStop)gapThroughStopBars++;
   if(gapThroughRisk)gapThroughRiskBars++;
   // These flags report uncertainty only: the proxy still cannot determine the intrabar path or executable fill.
   if(b.timestampMs===t.exitTime||stopRiskCollision||stopTargetCollision||gapThroughStop||gapThroughRisk)ambiguousRiskBars++;
   exit=mode==="THRESHOLD_PROXY"?riskPrice:worst;
   reason=crossed.name;
   actualExitTime=b.timestampMs;
   break;
  }
  const pnl=(exit-t.entry)*sign*size.usdPerPoint-friction;
  balance+=pnl;executed++;
  tradeAudit.push({date:t.date,entryTime:new Date(t.entryTime).toISOString(),exitTime:new Date(auditedExitTime(t.exitTime,actualExitTime===t.exitTime?null:actualExitTime)).toISOString(),direction:t.direction,entry:t.entry,exit,exitReason:reason,holdingMinutes:auditHoldingMinutes(t.entryTime,actualExitTime),netUsd:money(pnl),entryMinuteExit:actualExitTime===t.entryTime,stopTargetCollision:t.ambiguous});
  peak=Math.max(peak,balance);maxClosedDrawdown=Math.max(maxClosedDrawdown,peak-balance);
  if(reason==="MLL"){firstMllTouch=t.date;haltToday=true;}
  else if(reason==="OPERATING"){firstOperatingStop=t.date;haltToday=true;}
  else if(reason==="DAILY"){dailyCutoffDays++;haltToday=true;}
  else if(reason==="STOP")stopHits++;
  else if(reason==="TARGET")targets++;
  // Stress fills may gap through the higher-priority trigger and violate deeper limits.
  if(balance<=mllFloor&&firstMllTouch===null){firstMllTouch=t.date;haltToday=true;}
  if(balance<=operatingFloor&&firstOperatingStop===null){firstOperatingStop=t.date;haltToday=true;}
 }
 if(currentDate)highEod=Math.max(highEod,balance);
 const scorecard:StrategyScorecard={
  strategyId:strategy,strategyVersion:"p4a-fixed-first-pass-in-sample",
  position:size.label,mllUsd:mll,fillMode:mode,
  candidateSessions:dates.length,eligibleSessions:byDate.size,signals:ordered.length,executed,skipped,pretradeRejects,
  netUsd:money(balance-start),maxClosedEquityDrawdownUsd:money(maxClosedDrawdown),
  minimumModeledEodMllCushionUsd:money(minCushion),minimumObservedWorstBarCushionUsd:money(minObservedWorstBarCushion),
  stopTargetCollisionBars,stopRiskCollisionBars,gapThroughStopBars,gapThroughRiskBars,
  executionOrderUnresolved:ambiguousRiskBars>0,firstMllTouch,firstOperatingStop,
  accountProfitTargetNotModeled:true,fillCertified:false,outOfSampleValidated:false,
  researchStatus:firstMllTouch||firstOperatingStop||balance<start?"REJECT":"RESEARCH_MORE"
 };
 const scorecardErrors=validateScorecard(scorecard);
 if(scorecardErrors.length)throw Error("SCORECARD_VALIDATION_FAILED "+JSON.stringify({position:size.label,mll,mode,errors:scorecardErrors}));
 if(Math.abs(tradeAudit.reduce((a,t)=>a+t.netUsd,0)-(balance-start))>0.001)throw Error("AUDIT_RECONCILIATION_FAILED "+strategy+" "+mode);
 for(const t of tradeAudit)console.log("P4D_AUDIT_TRADE "+JSON.stringify({strategy,mode,...t}));
 const base=money(balance-start);
 const n=tradeAudit.length;
 const winners=tradeAudit.filter(t=>t.netUsd>0).sort((a,b)=>b.netUsd-a.netUsd);
 console.log("P4D_AUDIT_SUMMARY "+JSON.stringify({strategy,mode,executed:n,netUsd:base,totalBaselineCostsUsd:n*25,entryMinuteExits:tradeAudit.filter(t=>t.entryMinuteExit).length,entryMinuteStops:tradeAudit.filter(t=>t.entryMinuteExit&&t.exitReason==="STOP").length,entryMinuteTargets:tradeAudit.filter(t=>t.entryMinuteExit&&t.exitReason==="TARGET").length,exitReasons:Object.fromEntries([...new Set(tradeAudit.map(t=>t.exitReason))].map(reason=>[reason,tradeAudit.filter(t=>t.exitReason===reason).length])),scorecardNetUsd:scorecard.netUsd,scorecardResearchStatus:scorecard.researchStatus}));
 for(const extra of [0,2.5,5,10,20])console.log("P4D_COST_STRESS "+JSON.stringify({strategy,mode,additionalCostPerTradeUsd:extra,netUsd:money(base-n*extra),arithmeticOnly:true}));
 for(const ticks of [0,1,2,3])console.log("P4D_SLIPPAGE_STRESS "+JSON.stringify({strategy,mode,additionalAdverseTicksPerSide:ticks,netUsd:money(base-n*ticks*2*0.25*size.usdPerPoint),arithmeticOnly:true}));
 for(const flips of [0,1,2]){const selected=winners.slice(0,flips);const delta=selected.reduce((a,t)=>a+(t.netUsd-(-10*size.usdPerPoint-25)),0);console.log("P4D_WINNER_FLIP "+JSON.stringify({strategy,mode,winnersFlipped:flips,actualWinnersAvailable:winners.length,netUsd:flips<=winners.length?money(base-delta):null,arithmeticOnly:true}));}
 console.log("STRATEGY_SCORECARD "+JSON.stringify(scorecard));
 console.log("INTEGRATED_SURVIVAL "+JSON.stringify({mode,position:size.label,mllUsd:mll,signalsAvailable:ordered.length,executed,skipped,pretradeRejects,netUsd:money(balance-start),maxClosedEquityDrawdownUsd:money(maxClosedDrawdown),minimumModeledIntradayCushionUsd:money(minCushion),minimumObservedWorstBarCushionUsd:money(minObservedWorstBarCushion),observedWorstBarCushionIsStressEnvelope:true,dailyCutoffDays,stopHits,targets,ambiguousRiskBars,stopTargetCollisionBars,stopRiskCollisionBars,gapThroughStopBars,gapThroughRiskBars,executionOrderUnresolved:ambiguousRiskBars>0,firstMllTouch,firstOperatingStop,status:firstMllTouch?"MLL_TOUCH":firstOperatingStop?"OPERATING_STOP":"SURVIVED_SAMPLE",accountProfitTargetNotModeled:true}));
}
}
console.log("TM001 P4d TRADE AUDIT COMPLETE | CACHE ONLY | ZERO TRADES | NOT CERTIFIED");

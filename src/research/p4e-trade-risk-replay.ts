/** P4c production trade-level risk replay. Minute OHLC proxy only; no intrabar ordering or fill certification. */
import {firstRiskCrossing,type RiskLevel,type RiskTrigger} from "./p4e-risk-crossing.js";
import type {MinuteBar} from "../market/types.js";
export type P4FillMode="THRESHOLD_PROXY"|"WORST_BAR_STRESS";
export type P4TradeRiskInput={
 bars:readonly MinuteBar[];entryIndex:number;direction:"LONG"|"SHORT";entry:number;stop:number;target:number;
 plannedExit:number;plannedExitTime:number;plannedExitReason:string;balance:number;friction:number;usdPerPoint:number;
 levels:readonly RiskLevel[];mllFloor:number;mode:P4FillMode;
};
export function replayP4TradeRisk(x:P4TradeRiskInput){
 const sign=x.direction==="LONG"?1:-1,entryEquity=x.balance-x.friction;
 let exit=x.plannedExit,reason=x.plannedExitReason,exitTime=x.plannedExitTime;
 let minCushion=Infinity,minObservedWorstBarCushion=Infinity;
 let ambiguousRiskBars=0,stopTargetCollisionBars=0,stopRiskCollisionBars=0,gapThroughStopBars=0,gapThroughRiskBars=0;
 for(let j=x.entryIndex;j<x.bars.length;j++){
  const b=x.bars[j]!;
  if(b.timestampMs>x.plannedExitTime||(x.plannedExitReason==="TIME_EXIT"&&b.timestampMs===x.plannedExitTime))break;
  const worst=x.direction==="LONG"?b.low:b.high;
  const adverseEquity=x.balance+(worst-x.entry)*sign*x.usdPerPoint-x.friction;
  minObservedWorstBarCushion=Math.min(minObservedWorstBarCushion,adverseEquity-x.mllFloor);
  const crossed=firstRiskCrossing(entryEquity,adverseEquity,x.levels);
  const modeledEquity=crossed&&x.mode==="THRESHOLD_PROXY"?crossed.level:adverseEquity;
  minCushion=Math.min(minCushion,modeledEquity-x.mllFloor);
  if(!crossed)continue;
  const stopTouched=x.direction==="LONG"?b.low<=x.stop:b.high>=x.stop;
  const targetTouched=x.direction==="LONG"?b.high>=x.target:b.low<=x.target;
  const stopTargetCollision=stopTouched&&targetTouched;
  const gapThroughStop=x.direction==="LONG"?b.open<=x.stop:b.open>=x.stop;
  const riskPrice=x.entry+(crossed.level-x.balance+x.friction)/(sign*x.usdPerPoint);
  const gapThroughRisk=x.direction==="LONG"?b.open<=riskPrice:b.open>=riskPrice;
  if(stopTargetCollision)stopTargetCollisionBars++;
  if(stopTouched)stopRiskCollisionBars++;
  if(gapThroughStop)gapThroughStopBars++;
  if(gapThroughRisk)gapThroughRiskBars++;
  if(b.timestampMs===x.plannedExitTime||stopTouched||stopTargetCollision||gapThroughStop||gapThroughRisk)ambiguousRiskBars++;
  exit=x.mode==="THRESHOLD_PROXY"?riskPrice:worst;
  reason=crossed.name;
  exitTime=b.timestampMs;
  break;
 }
 const pnl=(exit-x.entry)*sign*x.usdPerPoint-x.friction;
 return {exit,reason,exitTime,pnl,minCushion,minObservedWorstBarCushion,ambiguousRiskBars,stopTargetCollisionBars,stopRiskCollisionBars,gapThroughStopBars,gapThroughRiskBars};
}

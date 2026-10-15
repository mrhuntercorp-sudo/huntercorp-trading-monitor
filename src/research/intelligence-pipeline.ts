/** E028 deterministic replay pipeline. No network, delivery or order interfaces. */
import type {MinuteBar} from "../market/types.js";
import {LondonHighRejectionDetector,type Observation} from "./market-intelligence.js";
export type PipelineEvent={
 id:string;type:"LONDON_HIGH_REJECTION_OBSERVED";product:"NQ";ticker:string;tradeDate:string;
 observedAtUtc:string;confirmedAtUtc:string;level:number;wickHigh:number;close:number;
 classification:"RESEARCH_ONLY";delivery:"LOCAL_ONLY";independentValidation:false;
};
export type PipelineResult={status:"ACCEPTED"|"DUPLICATE"|"GAP_QUARANTINED";event:PipelineEvent|null;missingMinutes:number};
export class IntelligencePipeline{
 private readonly detector:LondonHighRejectionDetector;
 private lastTimestamp:number|null=null;
 private readonly fingerprints=new Map<number,string>();
 private quarantined=false;
 private readonly emitted=new Set<string>();
 constructor(readonly tradeDate:string,readonly ticker:string,londonHigh:number){
  this.detector=new LondonHighRejectionDetector(tradeDate,ticker,londonHigh);
 }
 consume(bar:MinuteBar):PipelineResult{
  if(bar.contractTicker!==this.ticker||bar.productCode!=="NQ")throw Error("WRONG_CONTRACT");
  if(!Number.isSafeInteger(bar.timestampMs)||bar.timestampMs%60000!==0||
    ![bar.open,bar.high,bar.low,bar.close,bar.volume].every(Number.isFinite)||
    bar.volume<0||bar.low>Math.min(bar.open,bar.close)||bar.high<Math.max(bar.open,bar.close))
    throw Error("INVALID_BAR");
  const fingerprint=JSON.stringify([bar.open,bar.high,bar.low,bar.close,bar.volume,bar.sessionEndDate]);
  const existing=this.fingerprints.get(bar.timestampMs);
  if(existing!==undefined){
   if(existing!==fingerprint)throw Error("CONFLICTING_DUPLICATE");
   return {status:"DUPLICATE",event:null,missingMinutes:0};
  }
  if(this.lastTimestamp!==null&&bar.timestampMs<this.lastTimestamp)throw Error("OUT_OF_ORDER_BAR");
  const delta=this.lastTimestamp===null?60000:bar.timestampMs-this.lastTimestamp;
  this.fingerprints.set(bar.timestampMs,fingerprint);
  this.lastTimestamp=bar.timestampMs;
  if(delta>60000)this.quarantined=true;
  // Fail closed: once a gap is detected, this instance cannot emit further research observations.
  if(this.quarantined)return {status:"GAP_QUARANTINED",event:null,missingMinutes:Math.max(0,delta/60000-1)};
  const observation:Observation|null=this.detector.consumeCompletedBar(bar);
  if(!observation)return {status:"ACCEPTED",event:null,missingMinutes:0};
  const id=["TM001","LONDON_HIGH_REJECTION",this.ticker,this.tradeDate,observation.signalUtc].join(":");
  if(this.emitted.has(id))return {status:"DUPLICATE",event:null,missingMinutes:0};
  this.emitted.add(id);
  return {status:"ACCEPTED",missingMinutes:0,event:{
   id,type:"LONDON_HIGH_REJECTION_OBSERVED",product:"NQ",ticker:this.ticker,tradeDate:this.tradeDate,
   observedAtUtc:observation.signalUtc,confirmedAtUtc:observation.confirmedUtc,
   level:observation.level,wickHigh:observation.wickHigh,close:observation.close,
   classification:"RESEARCH_ONLY",delivery:"LOCAL_ONLY",independentValidation:false
  }};
 }
}

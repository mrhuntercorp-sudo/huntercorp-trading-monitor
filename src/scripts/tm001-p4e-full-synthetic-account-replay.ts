/** End-to-end synthetic multi-day replay using the SAME production account-state and
 * trade-risk functions as P4c. Expected values are specified independently below.
 * No market data/API/orders; OHLC intrabar ordering remains unresolved.
 */
import {strict as assert} from "node:assert";
import {beginAccountDate,pretradeAccountDecision,rejectPretrade,settleAccountTrade,closeAccountSample,type AccountState} from "../research/p4e-account-state.js";
import {replayP4TradeRisk,type P4FillMode} from "../research/p4e-trade-risk-replay.js";
import type {MinuteBar} from "../market/types.js";
const start:AccountState={start:50000,mll:3000,balance:50000,highEod:50000,dayStart:50000,currentDate:"",haltToday:false,firstMllTouch:null,firstOperatingStop:null};
let checks=0;function eq(a:unknown,b:unknown,label:string){assert.deepEqual(a,b,label);checks++;}
function bar(date:string,minute:number,open:number,high:number,low:number):MinuteBar{
 const t=Date.parse(date+"T14:30:00Z")+minute*60000;
 return {contractTicker:"NQZ6",productCode:"NQ",timestampMs:t,sessionEndDate:date,open,high,low,close:open,volume:100};
}
function trade(s:AccountState,date:string,mode:P4FillMode,kind:"WIN"|"RISK"|"STRESS_OPERATING"){
 s=beginAccountDate(s,date);
 const d=pretradeAccountDecision(s);
 if(!d.allowed)return {state:d.pretradeReject?rejectPretrade(s):s,executed:false,reason:"SKIPPED",exitTime:null,collision:0};
 const bars=kind==="WIN"?[bar(date,0,100,140,99)]:kind==="RISK"?[bar(date,0,100,101,99),bar(date,2,99,100,50)]:[bar(date,0,100,101,40)];
 const plannedExitTime=bars[bars.length-1]!.timestampMs;
 const r=replayP4TradeRisk({bars,entryIndex:0,direction:"LONG",entry:100,stop:90,target:140,plannedExit:kind==="WIN"?140:90,plannedExitTime,plannedExitReason:kind==="WIN"?"TARGET":"STOP",balance:s.balance,friction:25,usdPerPoint:10,levels:d.levels,mllFloor:d.mllFloor,mode});
 return {state:settleAccountTrade(s,r.pnl,r.reason),executed:true,reason:r.reason,exitTime:r.exitTime,collision:r.stopRiskCollisionBars};
}
for(const mode of ["THRESHOLD_PROXY","WORST_BAR_STRESS"] as const){
 let s=start;
 let a=trade(s,"2026-09-21",mode,"WIN");s=a.state;
 eq(a.executed,true,mode+" day1 trade executed");
 eq(s.balance,50375,mode+" day1 40-point target less $25 friction");
 s=beginAccountDate(s,"2026-09-22");
 eq(s.highEod,50375,mode+" EOD high ratchets");
 eq(pretradeAccountDecision(s).dailyFloor,49925,mode+" day2 daily floor");
 a=trade(s,"2026-09-22",mode,"RISK");s=a.state;
 eq(a.reason,"DAILY",mode+" day2 early daily risk exit");
 eq(a.exitTime,Date.parse("2026-09-22T14:32:00Z"),mode+" early risk timestamp");
 eq(s.balance,mode==="THRESHOLD_PROXY"?49925:49850,mode+" fill-mode account balance");
 eq(s.haltToday,true,mode+" daily trading halted");
 a=trade(s,"2026-09-22",mode,"WIN");
 eq(a.executed,false,mode+" same-day subsequent trade skipped");
 s=beginAccountDate(s,"2026-09-23");
 eq(s.haltToday,false,mode+" next day reset");
 eq(s.highEod,50375,mode+" losing day cannot reverse EOD ratchet");
 eq(pretradeAccountDecision(s).allowed,true,mode+" next-day trading permitted");
 a=trade(s,"2026-09-23",mode,"WIN");s=a.state;
 eq(s.balance,mode==="THRESHOLD_PROXY"?50300:50225,mode+" day3 final balance");
 eq(closeAccountSample(s).highEod,50375,mode+" final EOD high remains max");
}
let s=beginAccountDate({...start,highEod:51000},"2026-09-21");
let a=trade(s,"2026-09-21","WORST_BAR_STRESS","STRESS_OPERATING");s=a.state;
eq(a.reason,"DAILY","stress first threshold is daily");
eq(a.collision,1,"stress stop/risk collision flagged");
eq(s.balance,49375,"stress extreme passes operating floor");
eq(s.firstOperatingStop,"2026-09-21","operating breach recorded despite daily trigger");
eq(pretradeAccountDecision(beginAccountDate(s,"2026-09-22")).allowed,false,"operating breach persists next day");
let mll=beginAccountDate({...start,balance:46900},"2026-09-21");
mll=rejectPretrade(mll);
eq(mll.firstMllTouch,"2026-09-21","MLL pretrade breach recorded");
eq(pretradeAccountDecision(beginAccountDate(mll,"2026-09-22")).allowed,false,"MLL breach persists next day");
console.log("TM001 P4e FULL SYNTHETIC ACCOUNT+TRADE REPLAY GREEN "+checks+"/"+checks);
console.log("LIMITATION: Synthetic integration through production helpers, not an independent fill engine, historical OOS validation, or Topstep rule certification.");

/** Synthetic trades through the exact trade-risk replay used by P4c.
 * No API calls, cached data, orders, or fill certification.
 */
import {strict as assert} from "node:assert";
import {accountRiskFloors} from "../research/p4e-account-floors.js";
import {replayP4TradeRisk,type P4FillMode} from "../research/p4e-trade-risk-replay.js";
import type {MinuteBar} from "../market/types.js";
const t=Date.parse("2026-09-21T14:30:00Z"),m=60000;
function bar(min:number,open:number,high:number,low:number):MinuteBar{return {contractTicker:"NQZ6",productCode:"NQ",timestampMs:t+min*m,sessionEndDate:"2026-09-21",open,high,low,close:open,volume:100};}
const levels=accountRiskFloors({start:50000,highEod:50000,dayStart:50000,mll:3000});
function run(mode:P4FillMode,bars:MinuteBar[],extra:Partial<Parameters<typeof replayP4TradeRisk>[0]>={}){
 return replayP4TradeRisk({bars,entryIndex:0,direction:"LONG",entry:100,stop:90,target:140,plannedExit:105,plannedExitTime:t+30*m,plannedExitReason:"TIME_EXIT",balance:50000,friction:25,usdPerPoint:10,levels,mllFloor:47000,mode,...extra});
}
let n=0;function eq(a:unknown,b:unknown,label:string){assert.deepEqual(a,b,label);n++;}
const b=[bar(0,100,101,99),bar(2,99,100,50)];
const proxy=run("THRESHOLD_PROXY",b),stress=run("WORST_BAR_STRESS",b);
eq(proxy.reason,"DAILY","production proxy daily trigger");
eq(proxy.exit,57.5,"production proxy threshold price");
eq(proxy.pnl,-450,"production proxy risk P&L");
eq(proxy.exitTime,t+2*m,"production early timestamp");
eq(stress.reason,"DAILY","production stress daily trigger");
eq(stress.exit,50,"production stress extreme");
eq(stress.pnl,-525,"production stress P&L");
eq(stress.exitTime,t+2*m,"stress early timestamp");
eq(proxy.stopRiskCollisionBars,1,"stop and risk collision flagged");
eq(proxy.ambiguousRiskBars,1,"intrabar ambiguity flagged");
const immediate=run("THRESHOLD_PROXY",[bar(0,100,101,50)]);
eq(immediate.exitTime,t,"entry minute risk exit");
const time=run("THRESHOLD_PROXY",[bar(0,100,101,99),bar(30,105,105,1)]);
eq(time.reason,"TIME_EXIT","time exit bar high-low excluded");
eq(time.pnl,25,"time exit P&L");
const short=run("THRESHOLD_PROXY",[bar(0,100,150,99)],{direction:"SHORT",stop:110,target:60});
eq(short.reason,"DAILY","short risk trigger");
eq(short.exit,142.5,"short adverse threshold price");
const clean=run("THRESHOLD_PROXY",[bar(0,100,101,99),bar(2,105,106,104)]);
eq(clean.reason,"TIME_EXIT","favorable bars do not trigger");
console.log("TM001 P4e INTEGRATED PRODUCTION TRADE RISK GREEN "+n+"/"+n);
console.log("LIMITATION: Direct production trade replay only. Account-level day sequencing, full synthetic engine and fill certification remain unverified.");

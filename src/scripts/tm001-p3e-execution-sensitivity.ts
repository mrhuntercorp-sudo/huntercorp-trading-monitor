/**
 * TM001 P3e: read-only sensitivity of the P3d audited ORB outcomes.
 * This is arithmetic stress, not a fresh fill simulation.
 * The 27 P3d fills and $25/trade baseline are fixed.
 */
import {execFileSync} from "node:child_process";
const output=execFileSync(process.execPath,["--import","tsx","src/scripts/tm001-p3d-orb-trade-audit.ts"],{encoding:"utf8",maxBuffer:8*1024*1024});
const lines=output.split(/\r?\n/);
const prefix="P3D_AUDIT_TRADE ";
const trades=lines.filter(l=>l.startsWith(prefix)).map(l=>JSON.parse(l.slice(prefix.length)) as {date:string;entryTime:string;exitTime:string;direction:string;entry:number;exit:number;exitReason:string;netUsd:number;costUsd:number;holdingMinutes:number});
const summaryLine=lines.find(l=>l.startsWith("P3D_AUDIT_SUMMARY "));
if(!summaryLine)throw Error("P3D_BASELINE_MISSING");
const summary=JSON.parse(summaryLine.slice("P3D_AUDIT_SUMMARY ".length));
if(trades.length!==27||summary.executed!==27||summary.netUsd!==125||trades.reduce((n,t)=>n+t.netUsd,0)!==125)throw Error("P3E_BASELINE_RECONCILIATION_FAILED");
const entryMinute=trades.filter(t=>t.holdingMinutes===0);
const stopEntry=entryMinute.filter(t=>t.exitReason==="STOP");
const targetEntry=entryMinute.filter(t=>t.exitReason==="TARGET");
console.log("P3E_BASELINE "+JSON.stringify({trades:trades.length,netUsd:summary.netUsd,costUsd:summary.totalCostsUsd,entryMinuteExits:entryMinute.length,entryMinuteStops:stopEntry.length,entryMinuteTargets:targetEntry.length,source:"P3d exact trade log"}));
for(const additionalCostPerTrade of [0,2.5,5,10,20]){
 const netUsd=Math.round((125-27*additionalCostPerTrade)*100)/100;
 console.log("P3E_COST_STRESS "+JSON.stringify({additionalCostPerTradeUsd:additionalCostPerTrade,netUsd,positive:netUsd>0,baselineTradeCount:27,limitation:"Arithmetic cost stress; not resimulated fills or EOD MLL"}));
}
for(const adverseTicksPerSide of [0,1,2,3]){
 const additionalCostPerTrade=adverseTicksPerSide*2*0.25*10;
 console.log("P3E_SLIPPAGE_STRESS "+JSON.stringify({extraAdverseTicksPerSide:adverseTicksPerSide,extraCostPerTradeUsd:additionalCostPerTrade,netUsd:125-27*additionalCostPerTrade,limitation:"Fixed fills with incremental round-trip adverse ticks; not execution path"}));
}
for(const lostWinnerCount of [0,1,2]){
 console.log("P3E_WINNER_FLIP "+JSON.stringify({winnersReclassifiedAsStop:lostWinnerCount,netUsd:125-500*lostWinnerCount,limitation:"Outcome fragility stress, not estimated probability"}));
}
console.log("P3E_ENTRY_MINUTE "+JSON.stringify({trades:entryMinute.map(t=>({date:t.date,direction:t.direction,entryTime:t.entryTime,reason:t.exitReason,netUsd:t.netUsd})),caveat:"A same-minute stop or target touch does not establish actual order sequencing; no tick/order-book replay"}));
console.log("TM001 P3e SENSITIVITY COMPLETE | CACHE ONLY | NO NEW API | NO TRADES | NOT FILL CERTIFIED");

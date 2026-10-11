/** TM001 P4e: cache-only P4c matrix + P4d full trade-ledger reconciliation.
 * This is NOT a full independent risk-engine replay or fill certification.
 */
import {strict as assert} from "node:assert";
import {spawnSync} from "node:child_process";
type Score={strategyId:string;position:string;mllUsd:number;fillMode:string;netUsd:number;executed:number;researchStatus:string;firstMllTouch:string|null;firstOperatingStop:string|null;minimumModeledEodMllCushionUsd:number};
function run(path:string){
 const p=spawnSync(process.execPath,["--import","tsx",path],{encoding:"utf8",maxBuffer:32*1024*1024});
 if(p.error)throw p.error;
 if(p.status!==0)throw Error("SCRIPT_FAILED "+path+" "+p.status+" "+p.stderr.slice(-2500));
 const scores=(p.stdout.match(/^STRATEGY_SCORECARD (.+)$/gm)??[]).map(s=>JSON.parse(s.slice("STRATEGY_SCORECARD ".length)) as Score);
 return {scores,output:p.stdout};
}
const p4c=run("src/scripts/tm001-p4c-cached-eod-screen.ts");
const p4d=run("src/scripts/tm001-p4d-trade-execution-audit.ts");
const key=(x:Score)=>[x.strategyId,x.position,x.mllUsd,x.fillMode].join("|");
assert.equal(p4c.scores.length,48,"P4c must have 4 x 3 x 2 x 2 scorecards");
assert.equal(new Set(p4c.scores.map(key)).size,48,"P4c matrix duplicate");
assert.equal(p4d.scores.length,48,"P4d must audit all 48 configurations");
assert.equal(new Set(p4d.scores.map(key)).size,48,"P4d matrix duplicate");
const baseline=new Map(p4c.scores.map(s=>[key(s),s]));
const fields=(Object.keys(p4d.scores[0]??{}) as (keyof Score)[]);
for(const d of p4d.scores){
 const c=baseline.get(key(d));assert.ok(c,"P4d key missing from P4c: "+key(d));
 for(const f of fields)assert.deepEqual(d[f],c[f],"MATRIX_MISMATCH "+key(d)+" "+f);
}
const leader=p4d.scores.filter(x=>x.strategyId==="SESSION_TREND_PULLBACK_V1"&&x.position==="5_MNQ"&&x.mllUsd===3000);
assert.equal(leader.length,2);
for(const s of leader){assert.equal(s.netUsd,1500);assert.equal(s.executed,24);assert.equal(s.researchStatus,"RESEARCH_MORE");}
type Audit={strategy:string;position:string;mllUsd:number;mode:string;netUsd:number;exitTime:string;entryTime:string;holdingMinutes:number;entryMinuteExit:boolean};
const audits=(p4d.output.match(/^P4D_AUDIT_TRADE (.+)$/gm)??[]).map(s=>JSON.parse(s.slice("P4D_AUDIT_TRADE ".length)) as Audit);
const summaries=(p4d.output.match(/^P4D_AUDIT_SUMMARY (.+)$/gm)??[]).map(s=>JSON.parse(s.slice("P4D_AUDIT_SUMMARY ".length)) as {strategy:string;position:string;mllUsd:number;mode:string;executed:number;netUsd:number;entryMinuteExits:number;scorecardNetUsd:number});
assert.equal(summaries.length,48);
const ledgerKey=(s:{strategy:string;position:string;mllUsd:number;mode:string})=>[s.strategy,s.position,s.mllUsd,s.mode].join("|");
assert.equal(new Set(summaries.map(ledgerKey)).size,48);
for(const s of summaries){
 const trades=audits.filter(t=>ledgerKey(t)===ledgerKey(s));
 const score=baseline.get([s.strategy,s.position,s.mllUsd,s.mode].join("|"));
 assert.ok(score);
 assert.equal(trades.length,s.executed,"TRADE_COUNT "+ledgerKey(s));
 assert.equal(trades.length,score.executed,"SCORECARD_COUNT "+ledgerKey(s));
 assert.ok(Math.abs(trades.reduce((a,t)=>a+t.netUsd,0)-s.netUsd)<0.001,"LEDGER_NET "+ledgerKey(s));
 assert.equal(s.netUsd,s.scorecardNetUsd,"SUMMARY_NET "+ledgerKey(s));
 assert.equal(trades.filter(t=>t.entryMinuteExit).length,s.entryMinuteExits,"ENTRY_MINUTE "+ledgerKey(s));
 for(const t of trades){
  const elapsed=(Date.parse(t.exitTime)-Date.parse(t.entryTime))/60000;
  assert.equal(t.holdingMinutes,elapsed,"HOLD_TIME "+ledgerKey(s));
  assert.equal(t.entryMinuteExit,elapsed===0,"ENTRY_MINUTE_FLAG "+ledgerKey(s));
  assert.ok(elapsed>=0,"NEGATIVE_HOLD "+ledgerKey(s));
 }
}
const leadSummaries=summaries.filter(s=>s.strategy==="SESSION_TREND_PULLBACK_V1"&&s.position==="5_MNQ"&&s.mllUsd===3000);
assert.equal(leadSummaries.length,2);
for(const s of leadSummaries){assert.equal(s.entryMinuteExits,6);assert.equal(s.executed,24);assert.equal(s.netUsd,1500);}
console.log("TM001 P4e FULL MATRIX TRADE-LEDGER RECONCILIATION GREEN");
console.log("P4C_MATRIX "+JSON.stringify({scorecards:48,unique:48,strategies:4,sizes:3,mllScenarios:2,modes:2}));
console.log("P4D_MATRIX "+JSON.stringify({scorecards:48,matchedAgainstP4c:48,tradeRows:audits.length,tradeLedgersReconciled:48,independentRiskEngineReplay:false}));
console.log("TREND_BASELINE "+JSON.stringify({position:"5_MNQ",mllUsd:3000,modes:2,executed:24,netUsd:1500,entryMinuteExits:6}));
console.log("LIMITATION: Both scripts share core research logic; matrix agreement is not independent fill certification or a synthetic early-risk engine replay.");

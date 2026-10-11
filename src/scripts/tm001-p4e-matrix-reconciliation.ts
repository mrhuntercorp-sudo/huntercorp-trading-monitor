/** TM001 P4e: cache-only P4c matrix + P4d overlap reconciliation.
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
assert.equal(p4d.scores.length,8,"P4d currently only audits 4 x 1 x 1 x 2");
const baseline=new Map(p4c.scores.map(s=>[key(s),s]));
const fields=(Object.keys(p4d.scores[0]??{}) as (keyof Score)[]);
for(const d of p4d.scores){
 const c=baseline.get(key(d));assert.ok(c,"P4d key missing from P4c: "+key(d));
 for(const f of fields)assert.deepEqual(d[f],c[f],"MATRIX_MISMATCH "+key(d)+" "+f);
}
const leader=p4d.scores.filter(x=>x.strategyId==="SESSION_TREND_PULLBACK_V1");
assert.equal(leader.length,2);
for(const s of leader){assert.equal(s.netUsd,1500);assert.equal(s.executed,24);assert.equal(s.researchStatus,"RESEARCH_MORE");}
const summaries=(p4d.output.match(/^P4D_AUDIT_SUMMARY (.+)$/gm)??[]).map(s=>JSON.parse(s.slice("P4D_AUDIT_SUMMARY ".length)) as {strategy:string;mode:string;executed:number;netUsd:number;entryMinuteExits:number;scorecardNetUsd:number});
assert.equal(summaries.length,8);
for(const s of summaries){assert.equal(s.netUsd,s.scorecardNetUsd);if(s.strategy==="SESSION_TREND_PULLBACK_V1"){assert.equal(s.entryMinuteExits,6);assert.equal(s.executed,24);}}
console.log("TM001 P4e MATRIX RECONCILIATION GREEN");
console.log("P4C_MATRIX "+JSON.stringify({scorecards:48,unique:48,strategies:4,sizes:3,mllScenarios:2,modes:2}));
console.log("P4D_OVERLAP "+JSON.stringify({scorecards:8,matchedAgainstP4c:8,fullIndependentMatrixAudit:false}));
console.log("TREND_BASELINE "+JSON.stringify({position:"5_MNQ",mllUsd:3000,modes:2,executed:24,netUsd:1500,entryMinuteExits:6}));
console.log("LIMITATION: P4d only covers 8/48 configurations; remaining 40 require trade-level audit. Synthetic early-risk engine regression and time-exit boundaries remain outstanding.");

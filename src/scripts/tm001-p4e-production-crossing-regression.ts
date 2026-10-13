/** Direct tests of the risk-crossing function imported by the P4c engine.
 * Does not independently replay complete fills, stops, or EOD account state.
 */
import {strict as assert} from "node:assert";
import {firstRiskCrossing,type RiskLevel} from "../research/p4e-risk-crossing.js";
const levels:RiskLevel[]=[{name:"MLL",level:47000},{name:"OPERATING",level:48500},{name:"DAILY",level:49550}];
let n=0;
function check(got:string|null,want:string|null,label:string){assert.equal(got,want,label);n++;}
function first(entry:number,adverse:number,ls:RiskLevel[]=levels){return firstRiskCrossing(entry,adverse,ls)?.name??null;}
check(first(49975,49500),"DAILY","daily threshold first");
check(first(49975,48000),"DAILY","highest adverse crossing prioritized");
check(first(49550,48000),"OPERATING","already at daily floor cannot recross");
check(first(48500,46000),"MLL","already at operating floor cannot recross");
check(first(49975,49976),null,"no adverse crossing");
check(first(49975,49975),null,"flat equity");
check(first(49975,49550),"DAILY","equality triggers");
check(first(49975,49550,[...levels].reverse()),"DAILY","level ordering irrelevant");
check(first(50000,49000,[{name:"OPERATING",level:49000}]),"OPERATING","operating equality");
check(first(50000,47000,[{name:"MLL",level:47000}]),"MLL","MLL equality");
check(first(50000,49999),null,"no threshold reached");
check(first(50000,49549),"DAILY","one dollar below daily floor");
check(first(50000,50001),null,"favorable equity path does not trigger");
assert.throws(()=>firstRiskCrossing(NaN,49000,levels),/NONFINITE_EQUITY/);n++;
assert.throws(()=>firstRiskCrossing(50000,49000,[{name:"DAILY",level:NaN}]),/NONFINITE_RISK_LEVEL/);n++;
console.log("TM001 P4e PRODUCTION RISK CROSSING GREEN "+n+"/"+n+" | DIRECT PRODUCTION HELPER");
console.log("LIMITATION: threshold selector only; full integrated risk-engine synthetic replay and fill certification remain unverified.");

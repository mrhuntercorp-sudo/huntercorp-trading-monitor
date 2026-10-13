/** Direct regression against P4c production account-floor helpers. Synthetic only. */
import {strict as assert} from "node:assert";
import {accountRiskFloors,nextEodHigh} from "../research/p4e-account-floors.js";
let n=0;
const eq=(actual:unknown,expected:unknown,label:string)=>{assert.deepEqual(actual,expected,label);n++;};
const floors=(start:number,highEod:number,dayStart:number,mll:number)=>Object.fromEntries(accountRiskFloors({start,highEod,dayStart,mll}).map(x=>[x.name,x.level]));
eq(floors(50000,50000,50000,3000),{MLL:47000,OPERATING:48500,DAILY:49550},"$3k starting levels");
eq(floors(50000,50000,50000,2000),{MLL:48000,OPERATING:49000,DAILY:49700},"$2k starting levels");
eq(floors(50000,52000,52000,3000),{MLL:49000,OPERATING:50500,DAILY:51550},"EOD ratchet after gain");
eq(floors(50000,55000,55000,3000),{MLL:50000,OPERATING:53500,DAILY:54550},"MLL floor caps at start");
eq(floors(50000,55000,51000,3000),{MLL:50000,OPERATING:53500,DAILY:50550},"daily floor resets from day start");
eq(floors(50000,55000,50000,3000),{MLL:50000,OPERATING:53500,DAILY:49550},"internal operating floor may exceed balance");
eq(nextEodHigh(50000,51000),51000,"gain ratchets");
eq(nextEodHigh(51000,50500),51000,"loss does not reverse ratchet");
eq(nextEodHigh(51000,51000),51000,"flat day");
assert.throws(()=>accountRiskFloors({start:50000,highEod:50000,dayStart:50000,mll:0}),/INVALID_ACCOUNT_INPUT/);n++;
assert.throws(()=>nextEodHigh(NaN,50000),/INVALID_EOD_BALANCE/);n++;
console.log("TM001 P4e PRODUCTION ACCOUNT FLOORS GREEN "+n+"/"+n+" | DIRECT PRODUCTION HELPERS");
console.log("LIMITATION: synthetic floor arithmetic only; not full integrated engine replay or official Topstep rules.");

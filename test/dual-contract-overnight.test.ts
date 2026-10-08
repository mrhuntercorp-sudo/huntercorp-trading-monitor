import assert from "node:assert/strict";
import test from "node:test";
import { compareDualContractOvernight } from "../src/research/dual-contract-overnight.js";
import type { MinuteBar } from "../src/market/types.js";
const start=Date.parse("2026-09-13T22:00:00Z");
function sample(ticker:string,offset:number):MinuteBar[]{
 return Array.from({length:930},(_,i)=>({
  timestampMs:start+i*60000,contractTicker:ticker,productCode:"NQ" as const,
  sessionEndDate:"2026-09-14",open:20000+i/10+offset,high:20005+i/10+offset,
  low:19995+i/10+offset,close:20000+i/10+offset,volume:10
 }));
}
test("same-timestamp adjusted contracts agree exactly with fixed spread",()=>{
 const result=compareDualContractOvernight(sample("NQU6",0),sample("NQZ6",200),"2026-09-14",200);
 assert.equal(result.status,"EVALUATED");
 if(result.status!=="EVALUATED")throw Error("review");
 assert.equal(result.minutesCompared,930);
 assert.ok(Math.abs(result.highDifferencePoints)<1e-7);
 assert.ok(Math.abs(result.lowDifferencePoints)<1e-7);
 assert.ok(result.maxAbsoluteMinuteHighDifferencePoints<1e-7);
});
test("incomplete outgoing overnight fails closed",()=>{
 const result=compareDualContractOvernight(sample("NQU6",0).slice(1),sample("NQZ6",200),"2026-09-14",200);
 assert.equal(result.status,"REVIEW_REQUIRED");
 assert.equal("adjustedNewHigh" in result,false);
});
test("invalid offset rejects",()=>{
 assert.throws(()=>compareDualContractOvernight(sample("NQU6",0),sample("NQZ6",200),"2026-09-14",NaN));
});

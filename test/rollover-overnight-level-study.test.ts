import assert from "node:assert/strict";
import test from "node:test";
import { assessAdjustedOvernight } from "../src/research/rollover-overnight-level-study.js";
import type { MinuteBar } from "../src/market/types.js";
const start=Date.parse("2026-09-13T22:00:00Z");
function bars():MinuteBar[]{
 return Array.from({length:930},(_,i)=>({timestampMs:start+i*60000,
  contractTicker:"NQZ6",productCode:"NQ" as const,sessionEndDate:"2026-09-14",
  open:20100,high:i===0?20300:20110,low:i===1?20000:20090,close:20100,volume:1}));
}
test("complete overnight levels shift without changing range geometry",()=>{
 const result=assessAdjustedOvernight(bars(),"2026-09-14",200,20050,19800);
 assert.equal(result.status,"EVALUATED");
 if(result.status!=="EVALUATED")throw Error("unexpected review");
 assert.equal(result.coverage.high,20300);
 assert.equal(result.adjustedHigh,20100);
 assert.equal(result.adjustedLow,19800);
 assert.equal(result.geometryInvariant,true);
 assert.equal(result.rawSweptPriorHigh,true);
 assert.equal(result.adjustedSweptPriorHigh,true);
 assert.equal(result.rawSweptPriorLow,false);
 assert.equal(result.adjustedSweptPriorLow,false);
});
test("raw false high sweep is removed by point-in-time offset",()=>{
 const result=assessAdjustedOvernight(bars(),"2026-09-14",300,20050,19700);
 assert.equal(result.status,"EVALUATED");
 if(result.status!=="EVALUATED")throw Error("unexpected review");
 assert.equal(result.rawSweptPriorHigh,true);
 assert.equal(result.adjustedSweptPriorHigh,false);
});
test("incomplete overnight never emits adjusted highs or lows",()=>{
 const result=assessAdjustedOvernight(bars().slice(1),"2026-09-14",200,20050,19800);
 assert.equal(result.status,"REVIEW_REQUIRED");
 assert.equal("adjustedHigh" in result,false);
});
test("invalid reference prices reject",()=>{
 assert.throws(()=>assessAdjustedOvernight(bars(),"2026-09-14",NaN,20050,19800));
});

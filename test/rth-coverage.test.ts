import test from "node:test";
import assert from "node:assert/strict";
import {auditRthCoverage} from "../src/research/rth-coverage.js";
import type {MinuteBar} from "../src/market/types.js";
function bar(t:number):MinuteBar {return {contractTicker:"NQU6",productCode:"NQ",timestampMs:t,
 sessionEndDate:"2026-09-11",open:1,high:1,low:1,close:1,volume:1};}
test("quarantines exact two-hour September 11 gap",()=>{
 const start=Date.parse("2026-09-11T13:30:00Z");
 const bars=Array.from({length:390},(_,i)=>bar(start+i*60000)).filter(b=>
  b.timestampMs<Date.parse("2026-09-11T17:00:00Z")||b.timestampMs>=Date.parse("2026-09-11T19:00:00Z"));
 const a=auditRthCoverage(bars,"2026-09-11","NQU6");
 assert.equal(a.status,"QUARANTINED");assert.equal(a.missingMinutes,120);
 assert.equal(a.missingRanges[0]?.startUtc,"2026-09-11T17:00:00.000Z");
});
test("accepts complete RTH session",()=>{
 const start=Date.parse("2026-09-14T13:30:00Z");
 const a=auditRthCoverage(Array.from({length:390},(_,i)=>bar(start+i*60000)),
 "2026-09-14","NQU6");
 assert.equal(a.status,"COMPLETE");assert.equal(a.missingMinutes,0);
});

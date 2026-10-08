import assert from "node:assert/strict";
import test from "node:test";
import { adjustedPointInTime,cumulativeKnownOffset,inspectOvernightCoverage } from "../src/research/rollover-overnight-chain.js";
import type { MinuteBar } from "../src/market/types.js";
const events=[
 {knownAtMs:100,effectiveMs:200,oldTicker:"NQZ5",newTicker:"NQH6",spreadPoints:256.5},
 {knownAtMs:300,effectiveMs:400,oldTicker:"NQH6",newTicker:"NQM6",spreadPoints:211.25},
 {knownAtMs:500,effectiveMs:600,oldTicker:"NQM6",newTicker:"NQU6",spreadPoints:291.75}
];
test("multi-roll cumulative offset changes only after each effective timestamp",()=>{
 assert.equal(cumulativeKnownOffset(events,199),0);
 assert.equal(cumulativeKnownOffset(events,200),256.5);
 assert.equal(cumulativeKnownOffset(events,399),256.5);
 assert.equal(cumulativeKnownOffset(events,400),467.75);
 assert.equal(cumulativeKnownOffset(events,600),759.5);
 assert.equal(adjustedPointInTime(30000,events,600),29240.5);
});
test("future rollover events cannot change earlier as-of research price",()=>{
 assert.equal(adjustedPointInTime(30000,events,250),29743.5);
 assert.equal(adjustedPointInTime(30000,events.slice(0,1),250),29743.5);
});
test("same-day evidence and broken contract chain are rejected",()=>{
 assert.throws(()=>cumulativeKnownOffset([{...events[0]!,knownAtMs:200}],300));
 assert.throws(()=>cumulativeKnownOffset([events[0]!,{...events[1]!,oldTicker:"NQU6"}],500));
});
test("missing overnight bars fail closed, not fabricated levels",()=>{
 const r=inspectOvernightCoverage([],"2026-09-14");
 assert.equal(r.status,"REVIEW_REQUIRED");
 assert.equal(r.high,null);
 assert.equal(r.low,null);
 assert.equal(r.expectedMinutes,930);
});
test("complete 930-minute overnight yields valid high and low",()=>{
 const times:number[]=[];
 const from=Date.parse("2026-09-13T22:00:00Z");
 for(let i=0;i<930;i++)times.push(from+i*60000);
 const bars:MinuteBar[]=times.map((timestampMs,i)=>({
  timestampMs,contractTicker:"NQZ6",productCode:"NQ",sessionEndDate:"2026-09-14",
  open:20000,high:20000+i,low:19999,close:20000,volume:1
 }));
 const r=inspectOvernightCoverage(bars,"2026-09-14");
 assert.equal(r.status,"COMPLETE");
 assert.equal(r.high,20929);
 assert.equal(r.low,19999);
});

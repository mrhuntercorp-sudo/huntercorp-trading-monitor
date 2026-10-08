import assert from "node:assert/strict";
import test from "node:test";
import { shiftResearchBars,rangeIntegrity,compareCrossBoundary } from "../src/research/rollover-signal-integrity.js";
import type { MinuteBar } from "../src/market/types.js";
const bar=(time:number,price:number):MinuteBar=>({contractTicker:"NQU6",productCode:"NQ",
 timestampMs:time,sessionEndDate:"2026-06-15",open:price,high:price+10,low:price-5,close:price+2,volume:100});
test("fixed offset preserves OHLC geometry, volume and range width",()=>{
 const raw=[bar(0,20000),bar(60000,20020)];
 const adjusted=shiftResearchBars(raw,291.75);
 assert.equal(rangeIntegrity(raw,adjusted,291.75).invariant,true);
 assert.equal(raw[0]!.open,20000);
 assert.equal(adjusted[0]!.open,19708.25);
});
test("breakout comparison is invariant when both prices share same basis",()=>{
 const raw=[bar(0,20000),bar(60000,20020)];
 const adj=shiftResearchBars(raw,291.75);
 assert.equal(raw[1]!.close>raw[0]!.high,adj[1]!.close>adj[0]!.high);
});
test("raw cross-contract boundary can be false breakout; adjustment restores direction",()=>{
 const x=compareCrossBoundary(20000,20300,19950,20260);
 assert.equal(x.rawAbovePriorOldClose,true);
 assert.equal(x.adjustedAbovePriorOldClose,false);
 assert.equal(x.oldAbovePriorOldClose,false);
 assert.equal(x.residualPoints,10);
});
test("nonfinite adjustment fails closed",()=>{
 assert.throws(()=>shiftResearchBars([bar(0,20000)],Number.NaN));
});

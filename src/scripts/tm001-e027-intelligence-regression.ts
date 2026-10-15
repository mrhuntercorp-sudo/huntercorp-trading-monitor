/** E027 integration/regression using E026 historical fixture; no API. */
import {strict as assert} from "node:assert";
import {CachedHistoricalDays} from "../research/historical-cache.js";
import {makeBriefing,LondonHighRejectionDetector} from "../research/market-intelligence.js";
import {rthBars} from "../research/level-reclaim.js";
import type {MinuteBar} from "../market/types.js";
const ticker="NQZ6",date="2026-10-02",previous="2026-10-01";
const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("NETWORK_DISABLED");}});
const bars:MinuteBar[]=[];
for(const d of ["2026-09-30","2026-10-01","2026-10-02"])bars.push(...await cache.getDay({ticker,productCode:"NQ"},d));
const briefing=makeBriefing(bars,date,previous,ticker);
assert.equal(briefing.levels.london.high,31179);
assert.equal(briefing.levels.london.low,30839.5);
assert.equal(briefing.levels.asia.high,30935.75);
assert.equal(briefing.levels.priorRth.high,30883.5);
assert.equal(briefing.levels.overnightThrough0919.high,31222.25);
assert.equal(briefing.lastKnownClose,31167.5);
const detector=new LondonHighRejectionDetector(date,ticker,briefing.levels.london.high);
const events=rthBars(bars,date).map(b=>detector.consumeCompletedBar(b)).filter(e=>e!==null);
assert.equal(events.length,1);
assert.deepEqual(events[0],{signalUtc:"2026-10-02T13:43:00.000Z",confirmedUtc:"2026-10-02T13:44:00.000Z",
 level:31179,wickHigh:31181.75,close:31163});
const signal=rthBars(bars,date).find(b=>b.timestampMs===Date.parse("2026-10-02T13:43:00.000Z"))!;
const badOrder=new LondonHighRejectionDetector(date,ticker,31179);
assert.equal(badOrder.consumeCompletedBar(signal)?.confirmedUtc,"2026-10-02T13:44:00.000Z");
assert.throws(()=>badOrder.consumeCompletedBar(signal),/OUT_OF_ORDER_BAR/);
const badContract=new LondonHighRejectionDetector(date,ticker,31179);
assert.throws(()=>badContract.consumeCompletedBar({...signal,contractTicker:"NQU6"}),/WRONG_CONTRACT/);
const beforeOpen=new LondonHighRejectionDetector(date,ticker,31179);
assert.equal(beforeOpen.consumeCompletedBar({...signal,timestampMs:Date.parse("2026-10-02T13:20:00.000Z")}),null);
const strict=new LondonHighRejectionDetector(date,ticker,31179);
assert.equal(strict.consumeCompletedBar({...signal,high:31179,close:31178}),null);
console.log("=== TM001 E027 REUSABLE INTELLIGENCE REGRESSION ===");
console.log("BRIEFING_0920_ET",JSON.stringify(briefing));
console.log("DETECTOR_EVENT",JSON.stringify(events[0]));
console.log("E027_COMPLETE",JSON.stringify({briefingRegression:true,oneShotDetector:true,chronologyGuard:true,
 contractGuard:true,windowGuard:true,strictSweepGuard:true,noApi:true,noOrders:true,liveFeed:false}));

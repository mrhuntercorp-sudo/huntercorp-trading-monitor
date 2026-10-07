import assert from "node:assert/strict";
import test from "node:test";
import type { MinuteBar } from "../src/market/types.js";
import { pointsToUsd } from "../src/market/nq-spec.js";
import { roundTripFrictionUsd } from "../src/research/costs.js";
import { calculateOpeningRange, firstCloseBreakout } from "../src/research/orb.js";
import { summarizePerformance } from "../src/research/metrics.js";

function bar(timestampMs:number, high:number, low:number, close:number): MinuteBar {
  return { contractTicker:"NQZ6", productCode:"NQ", timestampMs,
    sessionEndDate:"2026-10-07", open:close, high, low, close, volume:100 };
}

test("NQ point value is $20 per contract", () => {
  assert.equal(pointsToUsd(1), 20);
  assert.equal(pointsToUsd(0.25), 5);
});

test("friction includes both sides of slippage", () => {
  assert.equal(roundTripFrictionUsd({roundTripCommissionUsd:5, slippageTicksPerSide:1}), 15);
});

test("naive ORB detects first close outside range", () => {
  const range=calculateOpeningRange([bar(1,101,99,100),bar(2,102,100,101)]);
  assert.deepEqual(range,{high:102,low:99,widthPoints:3});
  assert.equal(firstCloseBreakout(range,[bar(3,102,100,101),bar(4,103,101,102.25)]),"LONG");
});

test("performance summary calculates drawdown and profit factor", () => {
  const s=summarizePerformance([{pnlUsd:100},{pnlUsd:-50},{pnlUsd:-25},{pnlUsd:150}]);
  assert.equal(s.netPnlUsd,175);
  assert.equal(s.maxDrawdownUsd,75);
  assert.equal(s.profitFactor,250/75);
});

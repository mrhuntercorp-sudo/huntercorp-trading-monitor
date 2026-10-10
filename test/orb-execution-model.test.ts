import assert from "node:assert/strict";
import { test } from "node:test";
import { backtestNaiveOrb } from "../src/research/backtest.js";
import type { MinuteBar } from "../src/market/types.js";

const date = "2026-10-01";
function bar(minute: number, open: number, high: number, low: number, close: number): MinuteBar {
  return {
    contractTicker: "NQZ6", productCode: "NQ", sessionEndDate: date,
    timestampMs: Date.parse("2026-10-01T13:30:00Z") + minute * 60_000,
    open, high, low, close, volume: 100,
  };
}
const opening = Array.from({ length: 5 }, (_, i) => bar(i, 100, 105, 95, 100));
const config = {
  openingRangeMinutes: 5 as const, stopPoints: 10, targetPoints: 10,
  contracts: 1, friction: { roundTripCommissionUsd: 6, slippageTicksPerSide: 1 },
};
test("no breakout means no trade", () => {
  assert.deepEqual(backtestNaiveOrb([...opening, bar(5, 100, 104, 96, 100)], config), []);
});
test("close outside opening range triggers one trade at that close, not next open", () => {
  const trades = backtestNaiveOrb([...opening, bar(5, 100, 112, 99, 110), bar(6, 115, 122, 114, 120)], config);
  assert.equal(trades.length, 1);
  assert.equal(trades[0]!.direction, "LONG");
  assert.equal(trades[0]!.entry, 110);
  assert.equal(trades[0]!.exit, 120);
  assert.equal(trades[0]!.exitReason, "TARGET");
  assert.equal(trades[0]!.grossPnlUsd, 200);
  assert.equal(trades[0]!.frictionUsd, 16);
  assert.equal(trades[0]!.netPnlUsd, 184);
});
test("ambiguous later candle hitting stop and target exits at stop", () => {
  const trades = backtestNaiveOrb([...opening, bar(5, 100, 112, 99, 110), bar(6, 110, 121, 99, 110)], config);
  assert.equal(trades[0]!.exitReason, "STOP");
  assert.equal(trades[0]!.exit, 100);
  assert.equal(trades[0]!.netPnlUsd, -216);
});
test("trigger candle high/low is not used for stop or target", () => {
  const trades = backtestNaiveOrb([...opening, bar(5, 100, 135, 85, 110), bar(6, 110, 115, 105, 111)], config);
  assert.equal(trades[0]!.exitReason, "SESSION_END");
  assert.equal(trades[0]!.entry, 110);
  assert.equal(trades[0]!.exit, 111);
});
test("session-end fallback uses last available after-range close even if day is incomplete", () => {
  const trades = backtestNaiveOrb([...opening, bar(5, 100, 112, 99, 110), bar(6, 110, 115, 105, 112)], config);
  assert.equal(trades[0]!.exitReason, "SESSION_END");
  assert.equal(trades[0]!.exit, 112);
});
test("one trade per day even if price breaks opposite side later", () => {
  const trades = backtestNaiveOrb([...opening, bar(5, 100, 112, 99, 110), bar(6, 110, 111, 94, 95), bar(7, 95, 110, 80, 85)], config);
  assert.equal(trades.length, 1);
  assert.equal(trades[0]!.direction, "LONG");
});
test("short stop/target collision also favors stop", () => {
  const trades = backtestNaiveOrb([...opening, bar(5, 100, 101, 88, 90), bar(6, 90, 101, 79, 90)], config);
  assert.equal(trades[0]!.direction, "SHORT");
  assert.equal(trades[0]!.exitReason, "STOP");
  assert.equal(trades[0]!.exit, 100);
});

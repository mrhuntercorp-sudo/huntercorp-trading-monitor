import assert from "node:assert/strict";
import test from "node:test";
import { buildSessionFeatures, overnightBars } from "../src/research/session-features.js";
import type { MinuteBar } from "../src/market/types.js";

function bar(iso: string, high: number, low: number): MinuteBar {
  return { contractTicker: "NQZ6", productCode: "NQ", timestampMs: Date.parse(iso),
    sessionEndDate: "2026-10-01", open: low, high, low, close: high, volume: 1 };
}
test("overnight assigns previous evening to following New York trade date", () => {
  const bars = [
    bar("2026-09-30T21:59:00Z", 90, 80),
    bar("2026-09-30T22:00:00Z", 110, 100),
    bar("2026-10-01T12:00:00Z", 120, 105),
    bar("2026-10-01T13:29:00Z", 130, 110),
    bar("2026-10-01T13:30:00Z", 150, 140),
  ];
  const result = overnightBars(bars, "2026-10-01");
  assert.equal(result.length, 3);
  assert.deepEqual(result.map(b => b.high), [110, 120, 130]);
});
test("features keep previous RTH, overnight, and opening ranges separate", () => {
  const bars = [
    bar("2026-09-30T13:30:00Z", 210, 200),
    bar("2026-09-30T19:59:00Z", 230, 220),
    bar("2026-09-30T22:00:00Z", 110, 100),
    bar("2026-10-01T13:29:00Z", 130, 120),
    bar("2026-10-01T13:30:00Z", 155, 150),
    bar("2026-10-01T13:34:00Z", 165, 160),
    bar("2026-10-01T13:35:00Z", 180, 170),
    bar("2026-10-01T13:44:00Z", 190, 175),
    bar("2026-10-01T13:45:00Z", 220, 200),
  ];
  const f = buildSessionFeatures(bars, "2026-10-01", "2026-09-30");
  assert.deepEqual(f.previousRth, { high: 230, low: 200, bars: 2 });
  assert.deepEqual(f.overnight, { high: 130, low: 100, bars: 2 });
  assert.deepEqual(f.opening5, { high: 165, low: 150, bars: 2 });
  assert.deepEqual(f.opening15, { high: 190, low: 150, bars: 4 });
  assert.equal(f.rthBars, 5);
});
test("missing input yields null ranges rather than fabricated levels", () => {
  const f = buildSessionFeatures([], "2026-10-01", "2026-09-30");
  assert.equal(f.overnight, null);
  assert.equal(f.previousRth, null);
  assert.equal(f.opening5, null);
});

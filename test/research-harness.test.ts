import assert from "node:assert/strict";
import test from "node:test";

import type { MarketDataProvider, MinuteBar } from "../src/market/types.js";
import { loadResearchWindow } from "../src/research/harness.js";

function bar(timestampMs: number): MinuteBar {
  return {
    contractTicker: "NQZ6",
    productCode: "NQ",
    timestampMs,
    sessionEndDate: "2026-10-07",
    open: 25000,
    high: 25010,
    low: 24990,
    close: 25005,
    volume: 100,
  };
}

function providerWith(bars: MinuteBar[]): MarketDataProvider {
  return {
    name: "fixture",
    async resolveContract() {
      return { ticker: "NQZ6", productCode: "NQ" };
    },
    async getMinuteBars() {
      return bars;
    },
  };
}

test("accepts strictly ascending normalized bars", async () => {
  const result = await loadResearchWindow(providerWith([bar(1), bar(2), bar(3)]), {
    fromMs: 1,
    toMs: 4,
  });

  assert.equal(result.barCount, 3);
  assert.equal(result.firstTimestampMs, 1);
  assert.equal(result.lastTimestampMs, 3);
});

test("rejects duplicate or out-of-order timestamps", async () => {
  await assert.rejects(
    loadResearchWindow(providerWith([bar(2), bar(2)]), { fromMs: 1, toMs: 3 }),
    /strictly ascending/,
  );
});

test("rejects invalid research windows", async () => {
  await assert.rejects(
    loadResearchWindow(providerWith([]), { fromMs: 5, toMs: 5 }),
    /must end after/,
  );
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeMassiveResponse } from "../src/scripts/massive-nq-response-adapter.js";
import { executeBoundedBackfill } from "../src/scripts/massive-nq-backfill-safety.js";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const target = { ticker: "NQU6", date: "2026-08-03" };
const bar = { window_start: Date.parse("2026-08-03T14:30:00Z") * 1_000_000, session_end_date: "2026-08-03", open: 100, high: 101, low: 99, close: 100.5, volume: 10 };

test("accepts optional per-bar ticker and feeds executor without network", async () => {
  const normalized = normalizeMassiveResponse(target, { status: "OK", results: [bar] });
  assert.equal(normalized.results[0]?.ticker, target.ticker);
  const root = await mkdtemp(join(tmpdir(), "tm001-adapter-"));
  try {
    const result = await executeBoundedBackfill({ targets: [target], maxRequests: 1, transport: async () => normalized, persist: false, cacheRoot: root });
    assert.deepEqual(result, { requests: 1, validated: 1, written: 0 });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("rejects ticker mismatch, pagination and missing session date", () => {
  assert.throws(() => normalizeMassiveResponse(target, { results: [{ ...bar, ticker: "NQZ6" }] }), /TICKER_MISMATCH/);
  assert.throws(() => normalizeMassiveResponse(target, { results: [bar], next_url: "https://example.com/next" }), /PAGINATION_REQUIRED/);
  assert.throws(() => normalizeMassiveResponse(target, { results: [{ window_start: bar.window_start, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume }] }), /INVALID_SESSION_END_DATE/);
});

test("rejects out-of-day timestamps and invalid OHLCV", () => {
  assert.throws(() => normalizeMassiveResponse(target, { results: [{ ...bar, window_start: Date.parse("2026-08-04T14:30:00Z") * 1_000_000 }] }), /INVALID_TIMESTAMP/);
  assert.throws(() => normalizeMassiveResponse(target, { results: [{ ...bar, high: 99 }] }), /INVALID_OHLCV/);
});

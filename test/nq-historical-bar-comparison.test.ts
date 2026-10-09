import test from "node:test";
import assert from "node:assert/strict";
import { compareHistoricalBarMinutes } from "../src/research/nq-historical-bar-comparison.js";

const intervals = [
  { openUtc: "2026-07-02T12:00:00.000Z", closeUtc: "2026-07-02T12:03:00.000Z" },
  { openUtc: "2026-07-02T12:05:00.000Z", closeUtc: "2026-07-02T12:07:00.000Z" },
];
const at = (n: number) => `2026-07-02T12:${String(n).padStart(2, "0")}:00.000Z`;
const base = () => ({
  intervals,
  observedBarTimestamps: [at(0), at(2), at(5), at(6)],
  inspectionStartUtc: at(0),
  inspectionEndUtc: at(8),
  scheduleVerified: false,
  cacheFileExists: true,
});
test("compares bars and excludes synthetic scheduled break", () => {
  const output = compareHistoricalBarMinutes(base());
  assert.equal(output.expectedTradingMinutes, 5);
  assert.equal(output.observedBarMinutes, 4);
  assert.equal(output.absentBarMinutes, 1);
  assert.equal(output.scheduledClosureMinutes, 3);
  assert.deepEqual(output.absentTradingMinuteSamples, [at(1)]);
  assert.equal(output.completenessCertified, false);
});
test("unverified schedules remain gated", () => {
  const output = compareHistoricalBarMinutes(base());
  assert.equal(output.classification, "SCHEDULE_UNVERIFIED");
  assert.equal(output.completenessAssessed, false);
});
test("missing cache file is separate from absent trade bars", () => {
  const output = compareHistoricalBarMinutes({ ...base(), scheduleVerified: true, cacheFileExists: false,
    observedBarTimestamps: [] });
  assert.equal(output.classification, "CACHE_FILE_ABSENT");
  assert.equal(output.absentBarMinutes, 5);
  assert.equal(output.completenessCertified, false);
});
test("observed bars during scheduled closure are reported, not silently discarded", () => {
  const output = compareHistoricalBarMinutes({ ...base(), observedBarTimestamps: [...base().observedBarTimestamps, at(3)] });
  assert.deepEqual(output.unexpectedBarMinuteSamples, [at(3)]);
});
test("even full coverage does not certify completeness", () => {
  const output = compareHistoricalBarMinutes({ ...base(), scheduleVerified: true,
    observedBarTimestamps: [at(0), at(1), at(2), at(5), at(6)] });
  assert.equal(output.absentBarMinutes, 0);
  assert.equal(output.classification, "COMPARISON_ONLY");
  assert.equal(output.completenessCertified, false);
});
test("rejects duplicate, unaligned, and out-of-window bars", () => {
  assert.throws(() => compareHistoricalBarMinutes({ ...base(), observedBarTimestamps: [at(0), at(0)] }), /DUPLICATE_BAR_TIMESTAMP/);
  assert.throws(() => compareHistoricalBarMinutes({ ...base(), observedBarTimestamps: ["2026-07-02T12:01:30.000Z"] }), /INVALID_UTC_MINUTE/);
  assert.throws(() => compareHistoricalBarMinutes({ ...base(), observedBarTimestamps: [at(9)] }), /BAR_OUTSIDE_INSPECTION_WINDOW/);
});
test("rejects out-of-window intervals and invalid inspection windows", () => {
  assert.throws(() => compareHistoricalBarMinutes({ ...base(), inspectionEndUtc: at(6) }), /SCHEDULE_OUTSIDE_INSPECTION_WINDOW/);
  assert.throws(() => compareHistoricalBarMinutes({ ...base(), inspectionEndUtc: at(0) }), /INVALID_INSPECTION_WINDOW/);
});

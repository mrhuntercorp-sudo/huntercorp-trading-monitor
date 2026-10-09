import test from "node:test";
import assert from "node:assert/strict";
import { expectedUtcTradingMinutes } from "../src/research/nq-trading-minutes.js";
import { validateNqScheduleResponse } from "../src/research/nq-schedule-response.js";

const date = "2026-07-02";
const venue = "CME";
const event = (type: string, timestamp: string) => ({
  event: type, timestamp, product_code: "NQ", session_end_date: date, trading_venue: venue,
});
function fromEvents(...events: ReturnType<typeof event>[]) {
  return validateNqScheduleResponse({ status: "OK", results: events }, {
    sessionEndDate: date, tradingVenue: venue,
  }).intervals;
}
test("synthetic regular interval is open-inclusive and close-exclusive", () => {
  const minutes = expectedUtcTradingMinutes(fromEvents(
    event("pre_open", "2026-07-01T21:30:00Z"),
    event("open", "2026-07-01T22:00:00Z"),
    event("close", "2026-07-02T21:00:00Z"),
  ));
  assert.equal(minutes.length, 1380);
  assert.equal(minutes[0], "2026-07-01T22:00:00.000Z");
  assert.equal(minutes.at(-1), "2026-07-02T20:59:00.000Z");
  assert.ok(!minutes.includes("2026-07-01T21:30:00.000Z"));
  assert.ok(!minutes.includes("2026-07-02T21:00:00.000Z"));
});
test("synthetic early close reduces expected minutes", () => {
  const minutes = expectedUtcTradingMinutes(fromEvents(
    event("open", "2026-07-01T22:00:00Z"),
    event("close", "2026-07-02T17:00:00Z"),
  ));
  assert.equal(minutes.length, 1140);
});
test("intraday closure remains excluded between intervals", () => {
  const minutes = expectedUtcTradingMinutes(fromEvents(
    event("open", "2026-07-02T12:00:00Z"),
    event("close", "2026-07-02T12:02:00Z"),
    event("open", "2026-07-02T12:05:00Z"),
    event("close", "2026-07-02T12:07:00Z"),
  ));
  assert.deepEqual(minutes, [
    "2026-07-02T12:00:00.000Z", "2026-07-02T12:01:00.000Z",
    "2026-07-02T12:05:00.000Z", "2026-07-02T12:06:00.000Z",
  ]);
});
test("UTC midnight crossing preserves date and minute ordering", () => {
  assert.deepEqual(expectedUtcTradingMinutes(fromEvents(
    event("open", "2026-07-01T23:58:00Z"),
    event("close", "2026-07-02T00:02:00Z"),
  )), [
    "2026-07-01T23:58:00.000Z", "2026-07-01T23:59:00.000Z",
    "2026-07-02T00:00:00.000Z", "2026-07-02T00:01:00.000Z",
  ]);
});
test("rejects overlapping, reversed and unsorted intervals", () => {
  const a = { openUtc: "2026-07-02T12:00:00.000Z", closeUtc: "2026-07-02T12:05:00.000Z" };
  const b = { openUtc: "2026-07-02T12:04:00.000Z", closeUtc: "2026-07-02T12:06:00.000Z" };
  assert.throws(() => expectedUtcTradingMinutes([a, b]), /OVERLAPPING_OR_UNORDERED_INTERVALS/);
  assert.throws(() => expectedUtcTradingMinutes([b, a]), /OVERLAPPING_OR_UNORDERED_INTERVALS/);
  assert.throws(() => expectedUtcTradingMinutes([{ ...a, closeUtc: a.openUtc }]), /INVALID_SCHEDULE_INTERVAL/);
});
test("rejects fractional minute boundaries and invalid dates", () => {
  assert.throws(() => expectedUtcTradingMinutes([{
    openUtc: "2026-07-02T12:00:30.000Z", closeUtc: "2026-07-02T12:02:00.000Z",
  }]), /INVALID_MINUTE_BOUNDARY/);
  assert.throws(() => expectedUtcTradingMinutes([{
    openUtc: "2026-02-30T12:00:00.000Z", closeUtc: "2026-03-01T12:02:00.000Z",
  }]), /INVALID_MINUTE_BOUNDARY/);
});
test("rejects empty schedules and excessive expansions", () => {
  assert.throws(() => expectedUtcTradingMinutes([]), /NO_SCHEDULE_INTERVALS/);
  assert.throws(() => expectedUtcTradingMinutes(fromEvents(
    event("open", "2026-07-01T22:00:00Z"),
    event("close", "2026-07-02T21:00:00Z"),
  ), { maxMinutes: 100 }), /SCHEDULE_MINUTE_LIMIT_EXCEEDED/);
});

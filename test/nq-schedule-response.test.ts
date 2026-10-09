import test from "node:test";
import assert from "node:assert/strict";
import { validateNqScheduleResponse } from "../src/research/nq-schedule-response.js";

const expected = { sessionEndDate: "2026-07-02", tradingVenue: "XCME" };
const event = (name: string, timestamp: string, overrides: Record<string, unknown> = {}) =>
  ({ event: name, timestamp, product_code: "NQ", session_end_date: expected.sessionEndDate,
     trading_venue: expected.tradingVenue, ...overrides });
const regular = () => ({ status: "OK", results: [
  event("open", "2026-07-01T22:00:00Z"),
  event("close", "2026-07-02T21:00:00Z"),
] });
const validate = (value: unknown) => validateNqScheduleResponse(value, expected);

test("accepts paired synthetic regular schedule", () => {
  const output = validate(regular());
  assert.equal(output.intervals.length, 1);
  assert.equal(output.events[0]?.productCode, "NQ");
});
test("accepts paired synthetic early-close schedule", () => {
  const output = validate({ status: "OK", results: [
    event("open", "2026-07-01T22:00:00Z"),
    event("close", "2026-07-02T17:00:00Z"),
  ] });
  assert.equal(output.intervals[0]?.closeUtc, "2026-07-02T17:00:00.000Z");
});
test("rejects missing close and close without open", () => {
  assert.throws(() => validate({ status: "OK", results: [event("open", "2026-07-01T22:00:00Z")] }));
  assert.throws(() => validate({ status: "OK", results: [event("close", "2026-07-02T21:00:00Z")] }));
});
test("rejects wrong product, trade date, or venue", () => {
  for (const change of [{ product_code: "ES" }, { session_end_date: "2026-07-03" }, { trading_venue: "OTHER" }]) {
    assert.throws(() => validate({ status: "OK", results: [
      event("open", "2026-07-01T22:00:00Z", change), event("close", "2026-07-02T21:00:00Z"),
    ] }), /SCHEDULE_IDENTITY_MISMATCH/);
  }
});
test("sorts provider events chronologically but rejects timestamp collisions and impossible intervals", () => {
  const output = validate({ status: "OK", results: [
    event("close", "2026-07-02T21:00:00Z"),
    event("open", "2026-07-01T22:00:00Z"),
  ] });
  assert.deepEqual(output.events.map(item => item.event), ["open", "close"]);
  assert.throws(() => validate({ status: "OK", results: [
    event("open", "2026-07-01T22:00:00Z"),
    event("close", "2026-07-01T22:00:00Z"),
  ] }), /SCHEDULE_EVENT_TIMESTAMP_COLLISION/);
  assert.throws(() => validate({ status: "OK", results: [
    event("close", "2026-07-01T21:00:00Z"),
    event("open", "2026-07-01T22:00:00Z"),
  ] }), /SCHEDULE_UNPAIRED_CLOSE/);
});
test("rejects pagination and invalid status", () => {
  assert.throws(() => validate({ ...regular(), next_url: "https://example.invalid/page2" }), /SCHEDULE_PAGINATION_UNHANDLED/);
  assert.throws(() => validate({ ...regular(), status: "ERROR" }), /SCHEDULE_STATUS_NOT_OK/);
});
test("rejects invalid UTC timestamps and unknown events", () => {
  assert.throws(() => validate({ status: "OK", results: [
    event("open", "2026-07-01T25:00:00Z"), event("close", "2026-07-02T21:00:00Z"),
  ] }), /INVALID_UTC_TIMESTAMP/);
  assert.throws(() => validate({ status: "OK", results: [
    event("halt", "2026-07-01T21:00:00Z"), ...regular().results,
  ] }), /SCHEDULE_UNSUPPORTED_EVENT/);
});
test("rejects malformed or empty payload", () => {
  assert.throws(() => validate(null), /INVALID_SCHEDULE_OBJECT/);
  assert.throws(() => validate({ status: "OK", results: [] }), /SCHEDULE_RESULTS_MISSING/);
});

test("pre_open is metadata and does not expand trading intervals", () => {
  const output = validate({ status: "OK", results: [
    event("pre_open", "2026-07-01T21:30:00Z"),
    event("open", "2026-07-01T22:00:00Z"),
    event("close", "2026-07-02T21:00:00Z"),
  ] });
  assert.equal(output.events.length, 3);
  assert.deepEqual(output.intervals, [{
    openUtc: "2026-07-01T22:00:00.000Z",
    closeUtc: "2026-07-02T21:00:00.000Z",
  }]);
});
test("pre_open must be followed by open and cannot occur while trading", () => {
  assert.throws(() => validate({ status: "OK", results: [
    event("pre_open", "2026-07-01T21:00:00Z"),
  ] }), /SCHEDULE_UNPAIRED_PRE_OPEN/);
  assert.throws(() => validate({ status: "OK", results: [
    event("open", "2026-07-01T22:00:00Z"),
    event("pre_open", "2026-07-01T22:30:00Z"),
    event("close", "2026-07-02T21:00:00Z"),
  ] }), /SCHEDULE_INVALID_PRE_OPEN/);
  assert.throws(() => validate({ status: "OK", results: [
    event("pre_open", "2026-07-01T21:00:00Z"),
    event("pre_open", "2026-07-01T21:30:00Z"),
    ...regular().results,
  ] }), /SCHEDULE_INVALID_PRE_OPEN/);
});

test("accepts +00:00 UTC schedule timestamps and normalizes to Z", () => {
  const output = validate({ status: "OK", results: [
    event("pre_open", "2026-07-01T21:30:00+00:00"),
    event("open", "2026-07-01T22:00:00+00:00"),
    event("close", "2026-07-02T21:00:00+00:00"),
  ] });
  assert.deepEqual(output.intervals, [{
    openUtc: "2026-07-01T22:00:00.000Z",
    closeUtc: "2026-07-02T21:00:00.000Z",
  }]);
});
test("rejects nonzero offsets, invalid calendar values, and missing timezone", () => {
  for (const timestamp of [
    "2026-07-01T22:00:00-04:00",
    "2026-07-01T22:00:00+01:00",
    "2026-07-01T22:00:00",
    "2026-02-30T22:00:00+00:00",
  ]) {
    assert.throws(() => validate({ status: "OK", results: [
      event("open", timestamp), event("close", "2026-07-02T21:00:00Z"),
    ] }), /INVALID_UTC_TIMESTAMP/);
  }
});

test("collision diagnostic reports only normalized timestamp and validated event names", () => {
  assert.throws(() => validate({ status: "OK", results: [
    event("close", "2026-07-02T21:00:00Z"),
    event("open", "2026-07-01T22:00:00Z"),
    event("pre_open", "2026-07-01T22:00:00+00:00"),
  ] }), error => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /^SCHEDULE_EVENT_TIMESTAMP_COLLISION /);
    const detail = JSON.parse(error.message.slice("SCHEDULE_EVENT_TIMESTAMP_COLLISION ".length));
    assert.deepEqual(detail, {
      timestamp: "2026-07-01T22:00:00.000Z",
      events: ["open", "pre_open"],
      classification: "MIXED_OR_OTHER_TIMESTAMP_COLLISION_REVIEW",
    });
    return true;
  });
});

test("identical pre_open timestamps receive review classification and remain rejected", () => {
  assert.throws(() => validate({ status: "OK", results: [
    event("pre_open", "2026-07-01T21:45:00Z"),
    event("pre_open", "2026-07-01T21:45:00+00:00"),
    ...regular().results,
  ] }), error => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /^SCHEDULE_EVENT_TIMESTAMP_COLLISION /);
    const detail = JSON.parse(error.message.slice("SCHEDULE_EVENT_TIMESTAMP_COLLISION ".length));
    assert.deepEqual(detail, {
      timestamp: "2026-07-01T21:45:00.000Z",
      events: ["pre_open", "pre_open"],
      classification: "DUPLICATE_PRE_OPEN_TIMESTAMP_REVIEW",
    });
    return true;
  });
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { provisionalNqContract, isProvisionalRoll, provisionalClosedDates } from "../src/scripts/massive-nq-calendar-policy.js";
test("May and early June use provisional June contract", () => {
  assert.equal(provisionalNqContract("2026-05-28"), "NQM6");
  assert.equal(provisionalNqContract("2026-06-14"), "NQM6");
});
test("provisional June and September switches", () => {
  assert.equal(provisionalNqContract("2026-06-15"), "NQU6");
  assert.equal(provisionalNqContract("2026-09-13"), "NQU6");
  assert.equal(provisionalNqContract("2026-09-14"), "NQZ6");
  assert.equal(isProvisionalRoll("2026-06-15"), true);
  assert.equal(isProvisionalRoll("2026-09-14"), true);
});
test("holiday exclusions are explicitly provisional", () => {
  assert.equal(provisionalClosedDates.has("2026-07-03"), true);
  assert.equal(provisionalClosedDates.has("2026-09-07"), true);
});

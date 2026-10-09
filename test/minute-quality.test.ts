import test from "node:test";
import assert from "node:assert/strict";
import { classifyMinuteQuality, canApproveSessionCompleteness } from "../src/research/minute-quality.js";

const base = { cacheFileExists: true, schedule: "OPEN" as const, rolloverPolicyVerified: true };

test("missing trade-derived bar is unexplained, not automatically corrupt", () => {
  assert.equal(classifyMinuteQuality(base), "UNEXPLAINED_BAR_ABSENCE");
  assert.equal(canApproveSessionCompleteness(["UNEXPLAINED_BAR_ABSENCE"]), false);
});
test("absent UTC cache file remains a separate coverage gap", () => {
  assert.equal(classifyMinuteQuality({ ...base, cacheFileExists: false }), "CACHE_FILE_ABSENT");
});
test("verified closed minute is not a missing market bar", () => {
  assert.equal(classifyMinuteQuality({ ...base, schedule: "CLOSED" }), "SCHEDULED_CLOSURE");
});
test("unknown schedule and roll policy fail closed", () => {
  assert.equal(classifyMinuteQuality({ ...base, schedule: "UNVERIFIED" }), "SCHEDULE_UNVERIFIED");
  assert.equal(classifyMinuteQuality({ ...base, rolloverPolicyVerified: false }), "ROLLOVER_POLICY_REVIEW");
});
test("observed bars alone do not override an unresolved minute", () => {
  const bar = { timestampMs: 1 } as import("../src/market/types.js").MinuteBar;
  assert.equal(classifyMinuteQuality({ ...base, bar }), "OBSERVED_BAR");
  assert.equal(canApproveSessionCompleteness(["OBSERVED_BAR", "SCHEDULE_UNVERIFIED"]), false);
  assert.equal(canApproveSessionCompleteness(["OBSERVED_BAR", "SCHEDULED_CLOSURE"]), true);
  assert.equal(canApproveSessionCompleteness([]), false);
});

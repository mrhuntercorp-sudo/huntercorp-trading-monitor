import test from "node:test";
import assert from "node:assert/strict";
import { classifyMinuteQuality } from "../src/research/minute-quality.js";

test("missing UTC file candidate does not establish a complete session", () => {
  assert.equal(classifyMinuteQuality({
    cacheFileExists: false, schedule: "OPEN", rolloverPolicyVerified: true,
  }), "CACHE_FILE_ABSENT");
});
test("unverified historical NQ trading schedule blocks completeness", () => {
  assert.equal(classifyMinuteQuality({
    cacheFileExists: true, schedule: "UNVERIFIED", rolloverPolicyVerified: true,
  }), "SCHEDULE_UNVERIFIED");
});
test("unapproved rollover policy blocks completeness", () => {
  assert.equal(classifyMinuteQuality({
    cacheFileExists: true, schedule: "OPEN", rolloverPolicyVerified: false,
  }), "ROLLOVER_POLICY_REVIEW");
});

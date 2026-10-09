import assert from "node:assert/strict";
import { test } from "node:test";
import { expectedSessionMinutes, missingMinuteRanges, groupMissingByUtcFile } from "../src/scripts/massive-nq-repair-ranges.js";
import type { MinuteBar } from "../src/market/types.js";

test("regular overnight and RTH minute templates", () => {
  const session = expectedSessionMinutes("2026-09-10");
  assert.equal(session.overnight.length, 930);
  assert.equal(session.rth.length, 390);
});
test("identifies exact missing minutes in RTH", () => {
  const { rth } = expectedSessionMinutes("2026-09-10");
  const keep = rth.filter((_, i) => i < 20 || i >= 23);
  const bars = keep.map(timestampMs => ({ timestampMs })) as MinuteBar[];
  const ranges = missingMinuteRanges(rth, bars);
  assert.equal(ranges.length, 1);
  assert.equal(ranges[0]?.minutes, 3);
  assert.equal(Date.parse(ranges[0]!.endUtcExclusive) - Date.parse(ranges[0]!.startUtc), 180000);
});
test("splits missing ranges at UTC midnight", () => {
  const pieces = groupMissingByUtcFile([{ startUtc: "2026-09-10T23:58:00.000Z", endUtcExclusive: "2026-09-11T00:02:00.000Z", minutes: 4 }]);
  assert.deepEqual(pieces.map(p => [p.utcDate, p.gaps[0]?.minutes]), [["2026-09-10", 2], ["2026-09-11", 2]]);
});

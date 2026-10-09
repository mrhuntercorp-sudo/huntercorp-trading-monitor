import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("read-only diagnostic never invokes cached getDay or a network provider", async () => {
  const source = await readFile("src/scripts/massive-nq-cache-diagnostic.ts", "utf8");
  assert.doesNotMatch(source, /CachedHistoricalDays|fetch\s*\(|getDay\s*\(/);
  assert.match(source, /CACHE_SHA256_INVALID/);
  assert.match(source, /scheduleVerified: false/);
  assert.match(source, /comparisonPerformed: false/);
});

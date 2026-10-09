import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("read-only diagnostic has no executable cache-fetch or network path", async () => {
  const source = await readFile("src/scripts/massive-nq-cache-diagnostic.ts", "utf8");
  // Remove comments before checking for prohibited executable calls.
  // Avoid false positives from the explanatory safety comment.
  const executable = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(executable, /\bCachedHistoricalDays\b|\bfetch\s*\(|\bgetDay\s*\(/);
  assert.doesNotMatch(executable, /\bhttps?\.request\s*\(|\baxios\s*\(|\bgetContractMinuteBars\s*\(/);
  assert.match(executable, /readFile\(path, "utf8"\)/);
  assert.match(executable, /CACHE_SHA256_INVALID/);
  assert.match(executable, /scheduleVerified: false/);
  assert.match(executable, /comparisonPerformed: false/);
});

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { validateNqScheduleResponse } from "../research/nq-schedule-response.js";
import { compareHistoricalBarMinutes } from "../research/nq-historical-bar-comparison.js";

type CacheBar = { timestampMs: number };
type CachePayload = {
  schema: number; provider: string; ticker: string; productCode: string;
  utcDate: string; sha256: string; bars: CacheBar[];
};

/** Read only: does not use CachedHistoricalDays.getDay (which fetches on a miss). */
async function readCacheDay(ticker: string, utcDate: string): Promise<{ exists: boolean; timestamps: string[] }> {
  const path = join("data/cache/massive/NQ", ticker, utcDate + ".json");
  let raw: string;
  try { raw = await readFile(path, "utf8"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { exists: false, timestamps: [] };
    throw error;
  }
  const payload = JSON.parse(raw) as CachePayload;
  if (payload.schema !== 1 || payload.provider !== "massive" || payload.ticker !== ticker ||
      payload.productCode !== "NQ" || payload.utcDate !== utcDate || !Array.isArray(payload.bars) ||
      typeof payload.sha256 !== "string") throw Error("CACHE_METADATA_INVALID: " + path);
  const digest = createHash("sha256").update(JSON.stringify(payload.bars)).digest("hex");
  if (digest !== payload.sha256) throw Error("CACHE_SHA256_INVALID: " + path);
  const start = Date.parse(utcDate + "T00:00:00Z");
  let previous = -Infinity;
  const timestamps = payload.bars.map(bar => {
    if (!Number.isSafeInteger(bar.timestampMs) || bar.timestampMs % 60000 !== 0 ||
        bar.timestampMs < start || bar.timestampMs >= start + 86400000 ||
        bar.timestampMs <= previous) throw Error("CACHE_BAR_TIMESTAMP_INVALID: " + path);
    previous = bar.timestampMs;
    return new Date(bar.timestampMs).toISOString();
  });
  return { exists: true, timestamps };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 0 && (args.length !== 2 || args[0] !== "--schedule-file")) {
    throw Error("USAGE: [--schedule-file path-to-existing-NQ-schedule-json]");
  }
  // Deliberately narrow inspection of one historical UTC day.
  const ticker = "NQU6", utcDate = "2026-09-11";
  console.log("=== TM001 READ-ONLY CACHE DIAGNOSTIC ===");
  console.log("NO API | NO CACHE WRITES | NO TRADES | NO CERTIFICATION");
  const cache = await readCacheDay(ticker, utcDate);
  const base = {
    ticker, utcDate, cacheFileExists: cache.exists, observedBarMinutes: cache.timestamps.length,
    scheduleVerified: false, completenessAssessed: false, completenessCertified: false,
    acquisitionEnabled: false,
  };
  if (args.length === 0) {
    console.log("CACHE_DIAGNOSTIC " + JSON.stringify({
      ...base, classification: cache.exists ? "SCHEDULE_UNVERIFIED" : "CACHE_FILE_ABSENT",
      comparisonPerformed: false, warning: "No validated product-specific schedule supplied. No expected-minute comparison.",
    }));
    return;
  }
  const supplied = JSON.parse(await readFile(args[1]!, "utf8")) as unknown;
  const { intervals } = validateNqScheduleResponse(supplied, {
    sessionEndDate: utcDate, tradingVenue: "XCME",
  });
  // Require intervals to be fully contained within this UTC day.
  // Trade-date-spanning schedules must use a future multi-day adapter.
  const comparison = compareHistoricalBarMinutes({
    intervals, observedBarTimestamps: cache.timestamps,
    inspectionStartUtc: utcDate + "T00:00:00.000Z",
    inspectionEndUtc: new Date(Date.parse(utcDate + "T00:00:00Z") + 86400000).toISOString(),
    scheduleVerified: false, cacheFileExists: cache.exists,
  });
  console.log("CACHE_DIAGNOSTIC " + JSON.stringify({
    ...base, classification: comparison.classification, comparisonPerformed: true,
    comparison, warning: "Supplied JSON is not independently exchange-verified; no completeness certification.",
  }));
}
await main();

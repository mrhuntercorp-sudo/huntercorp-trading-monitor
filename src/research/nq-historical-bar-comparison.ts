import type { ScheduleInterval } from "./nq-schedule-response.js";
import { expectedUtcTradingMinutes } from "./nq-trading-minutes.js";

export type HistoricalBarComparison = {
  scheduleVerified: boolean;
  cacheFileExists: boolean;
  completenessAssessed: false;
  completenessCertified: false;
  classification: "SCHEDULE_UNVERIFIED" | "CACHE_FILE_ABSENT" | "COMPARISON_ONLY";
  expectedTradingMinutes: number;
  observedBarMinutes: number;
  absentBarMinutes: number;
  scheduledClosureMinutes: number;
  absentTradingMinuteSamples: string[];
  unexpectedBarMinuteSamples: string[];
};

/**
 * Offline diagnostic only. Never equate a missing trade-derived bar with a failed download.
 * Intervals must have been validated by validateNqScheduleResponse before this call.
 */
export function compareHistoricalBarMinutes(input: {
  intervals: readonly ScheduleInterval[];
  observedBarTimestamps: readonly string[];
  inspectionStartUtc: string;
  inspectionEndUtc: string;
  scheduleVerified: boolean;
  cacheFileExists: boolean;
  sampleLimit?: number;
}): HistoricalBarComparison {
  const { inspectionStartUtc, inspectionEndUtc } = input;
  const sampleLimit = input.sampleLimit ?? 10;
  if (!Number.isSafeInteger(sampleLimit) || sampleLimit < 0 || sampleLimit > 100) throw Error("INVALID_SAMPLE_LIMIT");
  const validMinute = (value: string): number => {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/.test(value)) throw Error("INVALID_UTC_MINUTE");
    const ms = Date.parse(value);
    if (!Number.isFinite(ms) || new Date(ms).toISOString() !== value) throw Error("INVALID_UTC_MINUTE");
    return ms;
  };
  const start = validMinute(inspectionStartUtc);
  const end = validMinute(inspectionEndUtc);
  if (start >= end) throw Error("INVALID_INSPECTION_WINDOW");
  if ((end - start) / 60_000 > 200_000) throw Error("INSPECTION_WINDOW_TOO_LARGE");
  const expected = new Set(expectedUtcTradingMinutes(input.intervals));
  for (const minute of expected) {
    const time = validMinute(minute);
    if (time < start || time >= end) throw Error("SCHEDULE_OUTSIDE_INSPECTION_WINDOW");
  }
  const observed = new Set<string>();
  for (const minute of input.observedBarTimestamps) {
    const time = validMinute(minute);
    if (time < start || time >= end) throw Error("BAR_OUTSIDE_INSPECTION_WINDOW");
    if (observed.has(minute)) throw Error("DUPLICATE_BAR_TIMESTAMP");
    observed.add(minute);
  }
  const missing = [...expected].filter(minute => !observed.has(minute));
  const unexpected = [...observed].filter(minute => !expected.has(minute));
  return {
    scheduleVerified: input.scheduleVerified,
    cacheFileExists: input.cacheFileExists,
    completenessAssessed: false,
    completenessCertified: false,
    classification: !input.scheduleVerified ? "SCHEDULE_UNVERIFIED" :
      !input.cacheFileExists ? "CACHE_FILE_ABSENT" : "COMPARISON_ONLY",
    expectedTradingMinutes: expected.size,
    observedBarMinutes: observed.size,
    absentBarMinutes: missing.length,
    scheduledClosureMinutes: (end - start) / 60_000 - expected.size,
    absentTradingMinuteSamples: missing.slice(0, sampleLimit),
    unexpectedBarMinuteSamples: unexpected.slice(0, sampleLimit),
  };
}

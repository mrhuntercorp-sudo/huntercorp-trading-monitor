import type { ScheduleInterval } from "./nq-schedule-response.js";

export type TradingMinute = string;

/**
 * Expand validated open-inclusive / close-exclusive UTC intervals to minute starts.
 * This is a synthetic/offline planning primitive, NOT evidence of actual NQ hours,
 * actual trades, or historical cache completeness.
 */
export function expectedUtcTradingMinutes(
  intervals: readonly ScheduleInterval[],
  options: { maxMinutes?: number } = {},
): TradingMinute[] {
  const maxMinutes = options.maxMinutes ?? 200_000;
  if (!Number.isSafeInteger(maxMinutes) || maxMinutes < 1) throw Error("INVALID_MINUTE_LIMIT");
  if (intervals.length === 0) throw Error("NO_SCHEDULE_INTERVALS");
  const minutes: string[] = [];
  let priorClose = -Infinity;
  for (const interval of intervals) {
    const start = parseCanonicalUtcMinute(interval.openUtc);
    const end = parseCanonicalUtcMinute(interval.closeUtc);
    if (start >= end) throw Error("INVALID_SCHEDULE_INTERVAL");
    if (start < priorClose) throw Error("OVERLAPPING_OR_UNORDERED_INTERVALS");
    priorClose = end;
    const count = (end - start) / 60_000;
    if (minutes.length + count > maxMinutes) throw Error("SCHEDULE_MINUTE_LIMIT_EXCEEDED");
    for (let ms = start; ms < end; ms += 60_000) {
      minutes.push(new Date(ms).toISOString());
    }
  }
  return minutes;
}

function parseCanonicalUtcMinute(value: unknown): number {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/.test(value)) {
    throw Error("INVALID_MINUTE_BOUNDARY");
  }
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || new Date(ms).toISOString() !== value) throw Error("INVALID_MINUTE_BOUNDARY");
  return ms;
}

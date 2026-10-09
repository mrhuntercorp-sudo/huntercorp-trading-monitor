import { newYorkClock } from "../market/time.js";
import type { MinuteBar } from "../market/types.js";

export type MissingRange = { startUtc: string; endUtcExclusive: string; minutes: number };
const dayMs = 86400000;
const day = (date: string) => Date.parse(date + "T00:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();
function nextDate(date: string) { return new Date(day(date) + dayMs).toISOString().slice(0, 10); }
export function expectedSessionMinutes(date: string): { overnight: number[]; rth: number[] } {
  const start = day(date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(start) || new Date(start).toISOString().slice(0, 10) !== date) throw Error("INVALID_TRADE_DATE");
  const previous = new Date(start - dayMs).toISOString().slice(0, 10);
  const overnight: number[] = [], rth: number[] = [];
  for (let t = start - dayMs - 6 * 3600000; t < start + dayMs; t += 60000) {
    const c = newYorkClock(t), m = c.hour * 60 + c.minute;
    if ((c.date === previous && m >= 1080) || (c.date === date && m < 570)) overnight.push(t);
    if (c.date === date && m >= 570 && m < 960) rth.push(t);
  }
  // Regular-session templates only. Calendar exceptions must be reviewed separately.
  if (overnight.length !== 930 || rth.length !== 390) throw Error("NONREGULAR_SESSION_TEMPLATE");
  return { overnight, rth };
}
export function missingMinuteRanges(expected: readonly number[], bars: readonly MinuteBar[]): MissingRange[] {
  const seen = new Set(bars.map(b => b.timestampMs));
  const missing = expected.filter(t => !seen.has(t));
  const ranges: MissingRange[] = [];
  for (const t of missing) {
    const last = ranges.at(-1);
    if (last && Date.parse(last.endUtcExclusive) === t) {
      last.endUtcExclusive = iso(t + 60000);
      last.minutes++;
    } else ranges.push({ startUtc: iso(t), endUtcExclusive: iso(t + 60000), minutes: 1 });
  }
  return ranges;
}
export function groupMissingByUtcFile(ranges: readonly MissingRange[]) {
  const byDate = new Map<string, MissingRange[]>();
  for (const range of ranges) {
    for (let t = Date.parse(range.startUtc); t < Date.parse(range.endUtcExclusive); ) {
      const date = iso(t).slice(0, 10);
      const boundary = day(nextDate(date));
      const stop = Math.min(boundary, Date.parse(range.endUtcExclusive));
      const piece = { startUtc: iso(t), endUtcExclusive: iso(stop), minutes: (stop - t) / 60000 };
      byDate.set(date, [...(byDate.get(date) ?? []), piece]);
      t = stop;
    }
  }
  return [...byDate].map(([utcDate, gaps]) => ({ utcDate, gaps }));
}

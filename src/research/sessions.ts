import type { MinuteBar } from "../market/types.js";
import { minutesAfterEt, newYorkClock } from "../market/time.js";

export function barsInEtWindow(
  bars: readonly MinuteBar[],
  startHour: number,
  startMinute: number,
  durationMinutes: number,
): MinuteBar[] {
  return bars.filter((bar) => {
    const offset = minutesAfterEt(bar.timestampMs, startHour, startMinute);
    return offset >= 0 && offset < durationMinutes;
  });
}

export function groupBarsByNewYorkDate(
  bars: readonly MinuteBar[],
): Map<string, MinuteBar[]> {
  const grouped = new Map<string, MinuteBar[]>();
  for (const bar of bars) {
    const date = newYorkClock(bar.timestampMs).date;
    const current = grouped.get(date) ?? [];
    current.push(bar);
    grouped.set(date, current);
  }
  return grouped;
}

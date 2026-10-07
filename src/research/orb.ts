import type { MinuteBar } from "../market/types.js";

export interface OpeningRange {
  high: number;
  low: number;
  widthPoints: number;
}

/**
 * Naive ORB control only.
 * Input bars must already be restricted to the desired opening-range window.
 * No strategy promotion is implied by this benchmark.
 */
export function calculateOpeningRange(bars: readonly MinuteBar[]): OpeningRange {
  if (bars.length === 0) throw new Error("Opening range requires bars.");

  const high = Math.max(...bars.map((bar) => bar.high));
  const low = Math.min(...bars.map((bar) => bar.low));

  if (!(high >= low)) throw new Error("Invalid opening range.");

  return { high, low, widthPoints: high - low };
}

export type BreakoutDirection = "LONG" | "SHORT" | null;

export function firstCloseBreakout(
  range: OpeningRange,
  bars: readonly MinuteBar[],
): BreakoutDirection {
  for (const bar of bars) {
    if (bar.close > range.high) return "LONG";
    if (bar.close < range.low) return "SHORT";
  }
  return null;
}

import type { MinuteBar } from "../market/types.js";

export function measureOrbPath(
  later: readonly MinuteBar[], entry: number, direction: "LONG" | "SHORT",
  openingHigh: number, openingLow: number, stopPoints: number, targetPoints: number,
) {
  const favorable = (b: MinuteBar) => direction === "LONG" ? b.high - entry : entry - b.low;
  const adverse = (b: MinuteBar) => direction === "LONG" ? entry - b.low : b.high - entry;
  const opposite = (b: MinuteBar) => direction === "LONG" ? b.low < openingLow : b.high > openingHigh;
  const stop = direction === "LONG" ? entry - stopPoints : entry + stopPoints;
  const target = direction === "LONG" ? entry + targetPoints : entry - targetPoints;
  let exitIndex = later.length - 1;
  let stopAndTargetSameBar = false;
  for (let i = 0; i < later.length; i++) {
    const b = later[i]!;
    const stopHit = direction === "LONG" ? b.low <= stop : b.high >= stop;
    const targetHit = direction === "LONG" ? b.high >= target : b.low <= target;
    if (stopHit || targetHit) { exitIndex = i; stopAndTargetSameBar = stopHit && targetHit; break; }
  }
  const beforeExit = later.slice(0, Math.max(0, exitIndex));
  const throughExit = later.slice(0, exitIndex + 1);
  const maximum = (bars: readonly MinuteBar[], fn: (bar: MinuteBar) => number) =>
    bars.length ? Math.max(0, ...bars.map(fn)) : 0;
  return {
    maxFavorableBeforeExitBarPoints: maximum(beforeExit, favorable),
    maxAdverseBeforeExitBarPoints: maximum(beforeExit, adverse),
    maxFavorableThroughExitBarPoints: maximum(throughExit, favorable),
    maxAdverseThroughExitBarPoints: maximum(throughExit, adverse),
    exitBarTimestampUtc: later[exitIndex] ? new Date(later[exitIndex]!.timestampMs).toISOString() : null,
    stopAndTargetSameBar,
    crossedOppositeOpeningBoundaryBeforeExit: beforeExit.some(opposite),
    crossedOppositeOpeningBoundaryThroughExit: throughExit.some(opposite),
    crossedOppositeOpeningBoundaryAfterEntry: later.some(opposite),
  };
}

import { pointsToUsd } from "../market/nq-spec.js";
import type { MinuteBar } from "../market/types.js";
import { roundTripFrictionUsd, type FrictionModel } from "./costs.js";
import { calculateOpeningRange } from "./orb.js";
import { barsInEtWindow, groupBarsByNewYorkDate } from "./sessions.js";

export interface OrbBacktestConfig {
  openingRangeMinutes: 5 | 15;
  stopPoints: number;
  targetPoints: number;
  contracts: number;
  friction: FrictionModel;
}

export interface SimulatedTrade {
  date: string;
  direction: "LONG" | "SHORT";
  entry: number;
  exit: number;
  grossPnlUsd: number;
  frictionUsd: number;
  netPnlUsd: number;
  exitReason: "STOP" | "TARGET" | "SESSION_END";
}

/**
 * Deliberately simple ORB control.
 * Entry: first close beyond the opening range after the range is complete.
 * Stop/target: fixed points from entry.
 * Ambiguous bars touching stop and target are resolved pessimistically to STOP.
 * One trade maximum per New York date.
 */
export function backtestNaiveOrb(
  bars: readonly MinuteBar[],
  config: OrbBacktestConfig,
): SimulatedTrade[] {
  if (config.stopPoints <= 0 || config.targetPoints <= 0 || config.contracts <= 0) {
    throw new Error("ORB risk parameters must be positive.");
  }

  const trades: SimulatedTrade[] = [];

  for (const [date, dayBars] of groupBarsByNewYorkDate(bars)) {
    const opening = barsInEtWindow(dayBars, 9, 30, config.openingRangeMinutes);
    if (opening.length !== config.openingRangeMinutes) continue;

    const range = calculateOpeningRange(opening);
    const afterRange = barsInEtWindow(
      dayBars,
      9,
      30 + config.openingRangeMinutes,
      390 - config.openingRangeMinutes,
    );
    const triggerIndex = afterRange.findIndex(
      (bar) => bar.close > range.high || bar.close < range.low,
    );
    if (triggerIndex < 0) continue;

    const trigger = afterRange[triggerIndex]!;
    const direction = trigger.close > range.high ? "LONG" : "SHORT";
    const entry = trigger.close;
    const stop = direction === "LONG" ? entry - config.stopPoints : entry + config.stopPoints;
    const target = direction === "LONG" ? entry + config.targetPoints : entry - config.targetPoints;

    let exit = afterRange.at(-1)!.close;
    let exitReason: SimulatedTrade["exitReason"] = "SESSION_END";

    for (const bar of afterRange.slice(triggerIndex + 1)) {
      const stopHit = direction === "LONG" ? bar.low <= stop : bar.high >= stop;
      const targetHit = direction === "LONG" ? bar.high >= target : bar.low <= target;

      if (stopHit) {
        exit = stop;
        exitReason = "STOP";
        break;
      }
      if (targetHit) {
        exit = target;
        exitReason = "TARGET";
        break;
      }
    }

    const pnlPoints = direction === "LONG" ? exit - entry : entry - exit;
    const grossPnlUsd = pointsToUsd(pnlPoints, config.contracts);
    const frictionUsd = roundTripFrictionUsd(config.friction, config.contracts);

    trades.push({
      date,
      direction,
      entry,
      exit,
      grossPnlUsd,
      frictionUsd,
      netPnlUsd: grossPnlUsd - frictionUsd,
      exitReason,
    });
  }

  return trades;
}

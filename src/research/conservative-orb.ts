import { pointsToUsd } from "../market/nq-spec.js";
import type { MinuteBar } from "../market/types.js";
import { roundTripFrictionUsd } from "./costs.js";
import { calculateOpeningRange } from "./orb.js";
import { auditRthCoverage } from "./rth-coverage.js";
import { barsInEtWindow, groupBarsByNewYorkDate } from "./sessions.js";
import { newYorkClock } from "../market/time.js";
import type { OrbBacktestConfig, SimulatedTrade } from "./backtest.js";

export interface ConservativeOrbTrade extends SimulatedTrade {
  entryTimestampMs: number;
  ambiguousExit: boolean;
  gapThroughStop: boolean;
}
export interface ConservativeOrbResult {
  trades: ConservativeOrbTrade[];
  excluded: { date: string; reason: string }[];
}

/**
 * Offline, conservative minute-bar ORB sensitivity model, NOT a fill guarantee.
 * Full regular RTH 09:30–15:59 ET required. Calendar/roll policy still external.
 * Breakout confirmed by bar close; enter next bar OPEN (never same bar).
 * Stop gaps fill at the worse of stop and bar open. Target gaps fill at target,
 * never at an advantageous open. Both touched => STOP.
 * Friction is charged separately; entry/exit prices are before slippage.
 */
export function backtestConservativeOrb(
  bars: readonly MinuteBar[], config: OrbBacktestConfig,
): ConservativeOrbResult {
  if (!Number.isFinite(config.stopPoints) || !Number.isFinite(config.targetPoints) ||
      !Number.isInteger(config.contracts) || config.stopPoints <= 0 ||
      config.targetPoints <= 0 || config.contracts <= 0) {
    throw Error("INVALID_ORB_RISK");
  }
  const trades: ConservativeOrbTrade[] = [];
  const excluded: ConservativeOrbResult["excluded"] = [];
  for (const [date, dayBars] of groupBarsByNewYorkDate(bars)) {
    const rth = dayBars.filter(b => {
      const c = newYorkClock(b.timestampMs);
      const m = c.hour * 60 + c.minute;
      return c.date === date && m >= 570 && m < 960;
    }).sort((a,b) => a.timestampMs - b.timestampMs);
    const tickers = new Set(rth.map(b => b.contractTicker));
    if (tickers.size !== 1) { excluded.push({date,reason:"CONTRACT_IDENTITY"}); continue; }
    const ticker = rth[0]!.contractTicker;
    let coverage;
    try { coverage = auditRthCoverage(rth,date,ticker); }
    catch { excluded.push({date,reason:"INVALID_RTH_DATA"}); continue; }
    if (coverage.status !== "COMPLETE") {
      excluded.push({date,reason:"INCOMPLETE_RTH"}); continue;
    }
    if (rth.some(b => !Number.isFinite(b.open) || !Number.isFinite(b.high) ||
        !Number.isFinite(b.low) || !Number.isFinite(b.close) ||
        b.low > Math.min(b.open,b.close) || b.high < Math.max(b.open,b.close))) {
      excluded.push({date,reason:"INVALID_OHLC"}); continue;
    }
    const opening = barsInEtWindow(rth,9,30,config.openingRangeMinutes);
    if (opening.length !== config.openingRangeMinutes) {
      excluded.push({date,reason:"INVALID_OPENING_RANGE"}); continue;
    }
    const range = calculateOpeningRange(opening);
    const triggerIndex = rth.findIndex((b,i) => i >= config.openingRangeMinutes &&
      (b.close > range.high || b.close < range.low));
    if (triggerIndex < 0) continue;
    const trigger = rth[triggerIndex]!;
    const next = rth[triggerIndex+1];
    if (!next) { excluded.push({date,reason:"NO_NEXT_BAR_FOR_ENTRY"}); continue; }
    const direction = trigger.close > range.high ? "LONG" as const : "SHORT" as const;
    const entry = next.open;
    const stop = direction === "LONG" ? entry-config.stopPoints : entry+config.stopPoints;
    const target = direction === "LONG" ? entry+config.targetPoints : entry-config.targetPoints;
    let exit = rth.at(-1)!.close;
    let exitReason: SimulatedTrade["exitReason"] = "SESSION_END";
    let ambiguousExit = false;
    let gapThroughStop = false;
    // The entry bar itself is evaluated: stop/target can hit after its opening print.
    for (const b of rth.slice(triggerIndex+1)) {
      const stopHit = direction === "LONG" ? b.low <= stop : b.high >= stop;
      const targetHit = direction === "LONG" ? b.high >= target : b.low <= target;
      if (stopHit) {
        ambiguousExit = targetHit;
        gapThroughStop = direction === "LONG" ? b.open < stop : b.open > stop;
        exit = gapThroughStop ? b.open : stop;
        exitReason = "STOP"; break;
      }
      if (targetHit) { exit = target; exitReason = "TARGET"; break; }
    }
    const pnlPoints = direction === "LONG" ? exit-entry : entry-exit;
    const grossPnlUsd = pointsToUsd(pnlPoints,config.contracts);
    const frictionUsd = roundTripFrictionUsd(config.friction,config.contracts);
    trades.push({date,direction,entry,exit,grossPnlUsd,frictionUsd,
      netPnlUsd:grossPnlUsd-frictionUsd,exitReason,
      entryTimestampMs:next.timestampMs,ambiguousExit,gapThroughStop});
  }
  return {trades,excluded};
}

import { MassiveHistoricalProvider } from "../providers/massive.js";
import { backtestNaiveOrb } from "../research/backtest.js";
import { summarizePerformance } from "../research/metrics.js";
import { newYorkClock } from "../market/time.js";
import type { MinuteBar } from "../market/types.js";

const key = process.env.MASSIVE_API_KEY?.trim();
if (!key) throw new Error("MASSIVE_API_KEY missing from environment.");
const provider = new MassiveHistoricalProvider(key);
const dates = ["2026-09-29", "2026-09-30", "2026-10-01"] as const;
const contract = await provider.resolveContract("NQ", dates[2]);
console.log("=== TM001 REAL-DATA ORB CONTROL ===");
console.log("Contract:", contract.ticker);
const bars: MinuteBar[] = [];
for (const date of dates) {
  const batch = await provider.getContractMinuteBars(contract, date, date);
  const rth = batch.filter(b => {
    const c = newYorkClock(b.timestampMs);
    const minute = c.hour * 60 + c.minute;
    return c.date === date && minute >= 570 && minute < 960;
  });
  console.log(`${date}: ${rth.length} RTH bars`);
  if (rth.length !== 390 || new Set(rth.map(b => b.timestampMs)).size !== 390 ||
      rth.some((b, i) => i > 0 && b.timestampMs - rth[i - 1]!.timestampMs !== 60000)) {
    throw new Error(`RTH DATA QUALITY: RED on ${date}`);
  }
  bars.push(...rth);
}
const friction = { roundTripCommissionUsd: 6, slippageTicksPerSide: 1 };
console.log("Assumed friction per contract: $6 round-trip commission + 1 tick slippage each side ($16 total).");
console.log("Stops/targets are illustrative, not optimized; fill assumptions remain simplified.");
for (const openingRangeMinutes of [5, 15] as const) {
  const trades = backtestNaiveOrb(bars, {
    openingRangeMinutes, stopPoints: 40, targetPoints: 80, contracts: 1, friction,
  });
  const summary = summarizePerformance(trades.map(t => ({ pnlUsd: t.netPnlUsd })));
  console.log(JSON.stringify({ openingRangeMinutes, trades, summary }, null, 2));
}
console.log("TM001 ORB CONTROL PIPELINE: GREEN (NOT STRATEGY APPROVAL)");

import { MassiveHistoricalProvider } from "../providers/massive.js";
import { backtestNaiveOrb } from "../research/backtest.js";
import { summarizePerformance } from "../research/metrics.js";
import { newYorkClock } from "../market/time.js";
import type { MinuteBar } from "../market/types.js";

const key = process.env.MASSIVE_API_KEY?.trim();
if (!key) throw new Error("MASSIVE_API_KEY missing.");
const dates = ["2026-09-21","2026-09-22","2026-09-23","2026-09-24","2026-09-25",
  "2026-09-28","2026-09-29","2026-09-30","2026-10-01","2026-10-02"];
const provider = new MassiveHistoricalProvider(key);
const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
console.log("=== TM001 TEN-SESSION ORB RESEARCH CONTROL ===");
console.log("Request pacing: 13 seconds between calls; no paid upgrade.");
const contract = await provider.resolveContract("NQ", dates.at(-1)!);
console.log("Single contract:", contract.ticker, "(rollover policy NOT validated)");
const bars: MinuteBar[] = [];
for (const date of dates) {
  await wait(13000);
  const batch = await provider.getContractMinuteBars(contract, date, date);
  const rth = batch.filter(b => {
    const c = newYorkClock(b.timestampMs);
    const m = c.hour * 60 + c.minute;
    return c.date === date && m >= 570 && m < 960;
  });
  const unique = new Set(rth.map(b => b.timestampMs));
  const gaps = rth.slice(1).filter((b,i) => b.timestampMs-rth[i]!.timestampMs !== 60000).length;
  console.log(`${date}: RTH=${rth.length}, gaps=${gaps}, duplicates=${rth.length-unique.size}`);
  if (rth.length !== 390 || gaps || unique.size !== 390) {
    throw new Error(`DATA QUALITY RED: ${date}; no partial benchmark.`);
  }
  bars.push(...rth);
}
for (const openingRangeMinutes of [5,15] as const) {
  const trades = backtestNaiveOrb(bars, {openingRangeMinutes, stopPoints:40,
    targetPoints:80, contracts:1, friction:{roundTripCommissionUsd:6,slippageTicksPerSide:1}});
  const summary = summarizePerformance(trades.map(t=>({pnlUsd:t.netPnlUsd})));
  console.log(JSON.stringify({openingRangeMinutes,days:dates.length,tradeCount:trades.length,
    tradeOutcomes:trades.map(t=>({date:t.date,direction:t.direction,exitReason:t.exitReason,netPnlUsd:t.netPnlUsd})),
    summary},null,2));
}
console.log("TM001 TEN-SESSION ORB CONTROL: GREEN (RESEARCH ONLY; NO STRATEGY APPROVAL)");

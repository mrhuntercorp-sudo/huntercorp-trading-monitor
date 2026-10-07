import { MassiveHistoricalProvider } from "../providers/massive.js";
import { buildSessionFeatures, overnightBars } from "../research/session-features.js";
import { newYorkClock } from "../market/time.js";
import type { MinuteBar } from "../market/types.js";

const key = process.env.MASSIVE_API_KEY?.trim();
if (!key) throw new Error("MASSIVE_API_KEY missing from environment.");

const provider = new MassiveHistoricalProvider(key);
const contract = await provider.resolveContract("NQ", "2026-10-01");
console.log("=== TM001 REAL SESSION FEATURES ===");
console.log("Contract:", contract.ticker);

const dates = ["2026-09-30", "2026-10-01"] as const;
const batches: MinuteBar[][] = [];
for (const date of dates) {
  batches.push(await provider.getContractMinuteBars(contract, date, date));
}
const bars = batches.flat().sort((a,b) => a.timestampMs - b.timestampMs);
const features = buildSessionFeatures(bars, "2026-10-01", "2026-09-30");
const overnight = overnightBars(bars, "2026-10-01");
const stamps = new Set(overnight.map(b => b.timestampMs));
const overnightGaps = overnight.slice(1).filter((b,i) => b.timestampMs - overnight[i]!.timestampMs !== 60000).length;
const opening = bars.filter(b => {
  const c = newYorkClock(b.timestampMs);
  return c.date === "2026-10-01" && c.hour === 9 && c.minute === 30;
});
console.log(JSON.stringify({
  tradeDate: features.tradeDate,
  overnight: features.overnight,
  overnightExpectedBars: 930,
  overnightGaps,
  overnightDuplicates: overnight.length - stamps.size,
  previousRth: features.previousRth,
  opening5: features.opening5,
  opening15: features.opening15,
  rthBars: features.rthBars,
  openingBarCount: opening.length
}, null, 2));
if (overnight.length !== 930 || overnightGaps !== 0 || stamps.size !== overnight.length ||
    features.previousRth?.bars !== 390 || features.opening5?.bars !== 5 ||
    features.opening15?.bars !== 15 || features.rthBars !== 390 || opening.length !== 1) {
  throw new Error("REAL SESSION FEATURES: RED — coverage or boundaries require investigation.");
}
console.log("TM001 REAL SESSION FEATURES: GREEN");

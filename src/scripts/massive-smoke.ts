import { MassiveHistoricalProvider } from "../providers/massive.js";

function apiKey(): string {
  const key = process.env.MASSIVE_API_KEY?.trim();
  if (!key) throw new Error("MASSIVE_API_KEY missing from environment.");
  return key;
}

const tradeDate = process.argv[2] ?? "2026-10-01";
const provider = new MassiveHistoricalProvider(apiKey());

console.log("=== TM001 MASSIVE NQ SMOKE TEST ===");
console.log(`Trade date: ${tradeDate}`);

const contract = await provider.resolveContract("NQ", tradeDate);
console.log(`Contract: ${contract.ticker}`);
console.log(`Tick size: ${contract.tradeTickSize ?? "unknown"}`);

const bars = await provider.getContractMinuteBars(contract, tradeDate, tradeDate);
console.log(`Minute bars returned: ${bars.length}`);
const unique = new Set(bars.map(b => b.timestampMs));
const nyTime = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const openingBars = bars.filter(b => nyTime.format(new Date(b.timestampMs)) === "09:30");
console.log(`Duplicate timestamps: ${bars.length - unique.size}`);
console.log(`09:30 ET opening bars: ${openingBars.length}`);
console.log(`First UTC: ${bars[0] ? new Date(bars[0].timestampMs).toISOString() : "none"}`);
console.log(`Last UTC: ${bars.at(-1) ? new Date(bars.at(-1)!.timestampMs).toISOString() : "none"}`);
if (bars.length < 300 || unique.size !== bars.length || openingBars.length !== 1) {
  throw new Error("Historical coverage validation failed; not suitable for backtests.");
}

const sample = bars[0];
if (!sample) throw new Error("No valid minute bars returned.");

console.log("First normalized bar:", {
  ticker: sample.contractTicker,
  timestampUtc: new Date(sample.timestampMs).toISOString(),
  sessionEndDate: sample.sessionEndDate,
  open: sample.open,
  high: sample.high,
  low: sample.low,
  close: sample.close,
  volume: sample.volume,
});
console.log("TM001 MASSIVE NQ SMOKE: GREEN");

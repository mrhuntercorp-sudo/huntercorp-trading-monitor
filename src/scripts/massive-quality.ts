import { MassiveHistoricalProvider } from "../providers/massive.js";
import type { MinuteBar } from "../market/types.js";

const key = process.env.MASSIVE_API_KEY?.trim();
if (!key) throw new Error("MASSIVE_API_KEY missing from environment.");

const dates = ["2026-09-29", "2026-09-30", "2026-10-01"] as const;
const provider = new MassiveHistoricalProvider(key);
const contract = await provider.resolveContract("NQ", dates[2]);
const formatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
function etParts(ms: number) {
  const parts = Object.fromEntries(formatter.formatToParts(new Date(ms)).map(p => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}
function inspect(date: string, bars: MinuteBar[]) {
  const timestamps = bars.map(b => b.timestampMs);
  const duplicates = timestamps.length - new Set(timestamps).size;
  const invalid = bars.filter(b => !Number.isFinite(b.open) || !Number.isFinite(b.high) ||
    !Number.isFinite(b.low) || !Number.isFinite(b.close) || !Number.isFinite(b.volume) ||
    b.low > Math.min(b.open, b.close) || b.high < Math.max(b.open, b.close) ||
    b.low > b.high || b.volume < 0).length;
  const rth = bars.filter(b => {
    const et = etParts(b.timestampMs);
    return et.date === date && et.minutes >= 570 && et.minutes < 960;
  });
  const gaps = rth.slice(1).filter((b, i) => b.timestampMs - rth[i]!.timestampMs !== 60000).length;
  const opening = rth.filter(b => etParts(b.timestampMs).minutes === 570).length;
  console.log(`${date}: UTC bars=${bars.length}, RTH bars=${rth.length}, opening=${opening}, RTH gaps=${gaps}, duplicates=${duplicates}, invalid OHLCV=${invalid}`);
  return rth.length === 390 && opening === 1 && gaps === 0 && duplicates === 0 && invalid === 0;
}

console.log("=== TM001 THREE-DAY NQ DATA QUALITY ===");
console.log(`Contract: ${contract.ticker} (same contract for all three dates; rollover not yet validated)`);
let allPass = true;
for (const date of dates) {
  const bars = await provider.getContractMinuteBars(contract, date, date);
  if (!inspect(date, bars)) allPass = false;
}
if (!allPass) throw new Error("DATA QUALITY: RED — investigate before research.");
console.log("THREE-DAY RTH DATA QUALITY: GREEN");

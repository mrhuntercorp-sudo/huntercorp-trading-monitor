import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { CachedHistoricalDays } from "../research/historical-cache.js";
import { provisionalClosedDates, provisionalNqContract, isProvisionalRoll } from "./massive-nq-calendar-policy.js";
import { planMissingNqFiles } from "./massive-nq-backfill-candidates.js";
import { expectedSessionMinutes, missingMinuteRanges, groupMissingByUtcFile } from "./massive-nq-repair-ranges.js";
import type { MinuteBar } from "../market/types.js";

const root = "data/cache/massive/NQ", end = "2026-10-02";
const dayMs = 86400000, ms = (d: string) => Date.parse(d + "T00:00:00Z");
const dateOf = (t: number) => new Date(t).toISOString().slice(0, 10);
const cache = new CachedHistoricalDays({ async getContractMinuteBars() { throw Error("NETWORK_DISABLED"); } });
const files = new Map<string, Set<string>>();
const memo = new Map<string, MinuteBar[]>();
async function readBars(ticker: string, utcDate: string): Promise<MinuteBar[]> {
  const id = ticker + ":" + utcDate;
  if (memo.has(id)) return memo.get(id)!;
  if (!files.has(ticker)) {
    let names: string[];
    try { names = await readdir(join(root, ticker)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; names = []; }
    files.set(ticker, new Set(names));
  }
  if (!files.get(ticker)!.has(utcDate + ".json")) return [];
  const bars = await cache.getDay({ ticker, productCode: "NQ" }, utcDate);
  memo.set(id, bars);
  return bars;
}
console.log("=== TM001 NON-DESTRUCTIVE REPAIR MANIFEST ===");
console.log("READ ONLY | NO API | NO WRITES | NO TRADES");
for (const window of [20, 60, 90] as const) {
  const plan = await planMissingNqFiles({ end, tradingSessions: window, cacheRoot: root });
  const dates: string[] = [];
  for (let t = ms(end); dates.length < window; t -= dayMs) {
    const date = dateOf(t), weekday = new Date(t).getUTCDay();
    if (weekday !== 0 && weekday !== 6 && !provisionalClosedDates.has(date)) dates.push(date);
  }
  dates.reverse();
  const missingFileKeys = new Set(plan.candidates.map(t => t.ticker + ":" + t.date));
  const repairFiles = new Map<string, { ticker: string; utcDate: string; gaps: { startUtc: string; endUtcExclusive: string; minutes: number }[]; sourceFileExists: boolean }>();
  const reviewDates: string[] = [];
  for (const date of dates) {
    const ticker = provisionalNqContract(date);
    const prev = dateOf(ms(date) - dayMs);
    const bars = [...await readBars(ticker, prev), ...await readBars(ticker, date)];
    const expected = expectedSessionMinutes(date);
    const gaps = [...missingMinuteRanges(expected.overnight, bars), ...missingMinuteRanges(expected.rth, bars)];
    for (const part of groupMissingByUtcFile(gaps)) {
      const id = ticker + ":" + part.utcDate;
      const entry = repairFiles.get(id) ?? { ticker, utcDate: part.utcDate, gaps: [], sourceFileExists: !missingFileKeys.has(id) };
      entry.gaps.push(...part.gaps);
      repairFiles.set(id, entry);
    }
    if (isProvisionalRoll(date)) reviewDates.push(date);
  }
  const items = [...repairFiles.values()];
  console.log("REPAIR_MANIFEST_WINDOW " + JSON.stringify({
    tradingSessions: window, firstDate: plan.firstDate, lastDate: plan.lastDate,
    missingUtcFiles: plan.candidates.length,
    existingUtcFilesWithGaps: items.filter(i => i.sourceFileExists).length,
    affectedUtcFiles: items.length,
    missingMinuteRanges: items,
    rolloverReviews: reviewDates, holidayPolicyVerified: false, rollPolicyVerified: false,
    approvedRequests: 0, approvedSpendUsd: 0, liveAcquisitionEnabled: false,
    warning: "This is a gap inventory, not a request budget. Regular-session template is provisional; existing files require non-destructive repair, and recovery API semantics are not approved."
  }));
}
console.log("TM001 REPAIR MANIFEST: GREEN (READ ONLY)");

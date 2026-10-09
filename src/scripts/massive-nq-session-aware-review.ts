import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { CachedHistoricalDays } from "../research/historical-cache.js";
import { auditRthCoverage } from "../research/rth-coverage.js";
import { overnightBars } from "../research/session-features.js";
import { newYorkClock } from "../market/time.js";
import { provisionalClosedDates, provisionalNqContract, isProvisionalRoll } from "./massive-nq-calendar-policy.js";
import { planMissingNqFiles } from "./massive-nq-backfill-candidates.js";
import type { MinuteBar } from "../market/types.js";

const root = "data/cache/massive/NQ";
const end = "2026-10-02";
const dayMs = 86400000;
const dateMs = (date: string) => Date.parse(date + "T00:00:00Z");
const dateOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const cache = new CachedHistoricalDays({ async getContractMinuteBars() { throw Error("NETWORK_DISABLED"); } });
const loaded = new Map<string, MinuteBar[]>();
const missing = new Set<string>();
async function barsFor(ticker: string, utcDate: string): Promise<MinuteBar[]> {
  const id = ticker + ":" + utcDate;
  if (loaded.has(id)) return loaded.get(id)!;
  if (missing.has(id)) return [];
  let names: string[];
  try { names = await readdir(join(root, ticker)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") { missing.add(id); return []; } throw error; }
  if (!names.includes(utcDate + ".json")) { missing.add(id); return []; }
  const bars = await cache.getDay({ ticker, productCode: "NQ" }, utcDate);
  loaded.set(id, bars);
  return bars;
}
console.log("=== TM001 SESSION-AWARE BACKFILL REVIEW ===");
console.log("READ ONLY | CACHE ONLY | NO API | NO WRITES | NO TRADES");
for (const window of [20, 60, 90] as const) {
  const plan = await planMissingNqFiles({ end, tradingSessions: window, cacheRoot: root });
  const dates: string[] = [];
  for (let t = dateMs(end); dates.length < window; t -= dayMs) {
    const date = dateOf(t), weekday = new Date(t).getUTCDay();
    if (weekday !== 0 && weekday !== 6 && !provisionalClosedDates.has(date)) dates.push(date);
  }
  dates.reverse();
  const incomplete: { date: string; ticker: string; rthMinutes: number; overnightMinutes: number; missingRthMinutes: number; missingOvernightMinutes: number }[] = [];
  const reviews: { date: string; reason: string }[] = [];
  let complete = 0, missingSessions = 0;
  for (const date of dates) {
    const ticker = provisionalNqContract(date);
    const previous = dateOf(dateMs(date) - dayMs);
    const bars = [...await barsFor(ticker, previous), ...await barsFor(ticker, date)];
    const rth = bars.filter(b => { const c = newYorkClock(b.timestampMs), m = c.hour * 60 + c.minute; return c.date === date && m >= 570 && m < 960; });
    const overnight = overnightBars(bars, date);
    const rthResult = auditRthCoverage(rth, date, ticker);
    const overnightTimes = overnight.map(b => b.timestampMs);
    const overnightComplete = overnightTimes.length === 930 && overnightTimes.every((t, i) => i === 0 || t - overnightTimes[i - 1]! === 60000);
    const sessionComplete = rthResult.status === "COMPLETE" && overnightComplete;
    if (isProvisionalRoll(date)) reviews.push({ date, reason: "ROLLOVER_POLICY_UNVERIFIED" });
    if (sessionComplete) complete++;
    else if (!rth.length && !overnight.length) missingSessions++;
    else incomplete.push({ date, ticker, rthMinutes: rth.length, overnightMinutes: overnight.length, missingRthMinutes: rthResult.missingMinutes, missingOvernightMinutes: Math.max(0, 930 - overnight.length) });
  }
  console.log("SESSION_AWARE_WINDOW " + JSON.stringify({
    tradingSessions: window, firstDate: plan.firstDate, lastDate: plan.lastDate,
    missingUtcDateFiles: plan.candidates.length, missingUtcFileCandidates: plan.candidates,
    completeByMinuteCoverage: complete, missingSessions, incompleteSessions: incomplete.length,
    incompleteSessionDetails: incomplete, calendarAndRolloverReviews: reviews,
    approvedRequests: 0, liveAcquisitionEnabled: false,
    warning: "Coverage is measured against regular 930-minute overnight and 390-minute RTH templates; holidays and rollover remain provisional. Existing incomplete files cannot be overwritten by the current executor."
  }));
}
console.log("TM001 SESSION-AWARE BACKFILL REVIEW: GREEN (READ ONLY)");

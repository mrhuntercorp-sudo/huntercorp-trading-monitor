import { readdir } from "node:fs/promises";
import { join } from "node:path";

const root = "data/cache/massive/NQ";
const end = "2026-10-02";
const windows = [20, 60, 90] as const;
const closed = new Set(["2026-07-03", "2026-09-07"]);
const msDay = 86_400_000;
const dateOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const dateMs = (date: string) => Date.parse(date + "T00:00:00Z");
const cache = new Map<string, Set<string>>();

for (const ticker of ["NQU6", "NQZ6"]) {
  let names: string[];
  try { names = await readdir(join(root, ticker)); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    names = [];
  }
  cache.set(ticker, new Set(names.filter(n => /^\d{4}-\d{2}-\d{2}\.json$/.test(n)).map(n => n.slice(0, 10))));
}
console.log("=== TM001 HISTORICAL BACKFILL PLANNER ===");
console.log("DRY RUN ONLY | CACHE FILENAMES ONLY | NO API | NO ENV | NO WRITES | NO TRADES");
const sessions: string[] = [];
for (let t = dateMs(end); sessions.length < Math.max(...windows); t -= msDay) {
  const date = dateOf(t);
  const weekday = new Date(t).getUTCDay();
  if (weekday !== 0 && weekday !== 6 && !closed.has(date)) sessions.push(date);
}
for (const window of windows) {
  const selected = sessions.slice(0, window).reverse();
  const missing = new Map<string, { ticker: string; utcDate: string }>();
  const rolloverReview: string[] = [];
  const dates = selected.map(date => {
    const ticker = date < "2026-09-14" ? "NQU6" : "NQZ6";
    if (date === "2026-09-14") rolloverReview.push(date);
    const previous = dateOf(dateMs(date) - msDay);
    const required = [previous, date];
    const absent = required.filter(utcDate => !cache.get(ticker)!.has(utcDate));
    for (const utcDate of absent) missing.set(ticker + ":" + utcDate, { ticker, utcDate });
    return { date, ticker, missingUtcDates: absent, rolloverReview: date === "2026-09-14" };
  });
  console.log("BACKFILL_WINDOW " + JSON.stringify({
    tradingSessions: window,
    firstDate: selected[0],
    lastDate: selected.at(-1),
    missingUtcDateFiles: missing.size,
    minimumRequestsIfEachMissingUtcDateRequiresOneRequest: missing.size,
    candidateRequests: [...missing.values()],
    rolloverReview,
    accountEntitlementsVerified: false,
    rateLimitVerified: false,
    holidayCalendarVerified: false,
    rolloverPolicyApproved: false,
    approvedRequests: 0,
    approvedSpendUsd: 0,
    liveRecoveryEnabled: false,
    warning: "File presence is not session completeness. Existing files require integrity and session coverage audits; no live acquisition allowed."
  }));
  if (window === 20) console.log("TWENTY_DAY_SESSION_PLAN " + JSON.stringify(dates));
}
console.log("TM001 BACKFILL PLANNER: GREEN (DRY RUN ONLY)");

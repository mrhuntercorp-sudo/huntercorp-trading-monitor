import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { provisionalClosedDates, provisionalNqContract, isProvisionalRoll } from "./massive-nq-calendar-policy.js";

const dayMs = 86400000;
const dateMs = (date: string) => Date.parse(date + "T00:00:00Z");
const dateOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export type BackfillTarget = { ticker: string; date: string };
export async function planMissingNqFiles(options: {
  end: string; tradingSessions: 20 | 60 | 90; cacheRoot: string;
}): Promise<{
  firstDate: string; lastDate: string; candidates: BackfillTarget[];
  rolloverReview: string[]; holidayPolicyVerified: false; rollPolicyVerified: false;
}> {
  const { end, tradingSessions, cacheRoot } = options;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end) || !Number.isFinite(dateMs(end)) || dateOf(dateMs(end)) !== end) throw Error("INVALID_END_DATE");
  const files = new Map<string, Set<string>>();
  for (const ticker of ["NQM6", "NQU6", "NQZ6"]) {
    let names: string[];
    try { names = await readdir(join(cacheRoot, ticker)); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      names = [];
    }
    files.set(ticker, new Set(names.filter(n => /^\d{4}-\d{2}-\d{2}\.json$/.test(n)).map(n => n.slice(0, 10))));
  }
  const dates: string[] = [];
  for (let time = dateMs(end); dates.length < tradingSessions; time -= dayMs) {
    const date = dateOf(time);
    const weekday = new Date(time).getUTCDay();
    if (weekday !== 0 && weekday !== 6 && !provisionalClosedDates.has(date)) dates.push(date);
  }
  const candidates = new Map<string, BackfillTarget>();
  const rolloverReview: string[] = [];
  for (const date of dates.reverse()) {
    const ticker = provisionalNqContract(date);
    if (isProvisionalRoll(date)) rolloverReview.push(date);
    for (const utcDate of [dateOf(dateMs(date) - dayMs), date]) {
      if (!files.get(ticker)!.has(utcDate)) candidates.set(ticker + ":" + utcDate, { ticker, date: utcDate });
    }
  }
  return { firstDate: dates[0]!, lastDate: dates.at(-1)!, candidates: [...candidates.values()], rolloverReview, holidayPolicyVerified: false, rollPolicyVerified: false };
}

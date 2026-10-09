import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { planMissingNqFiles } from "./massive-nq-backfill-candidates.js";
import { executeBoundedBackfill } from "./massive-nq-backfill-safety.js";
import { pacedTransport, type Clock } from "./massive-nq-paced-transport.js";

if (process.argv.includes("--execute")) throw Error("LIVE_ACQUISITION_DISABLED");
console.log("=== TM001 PLANNER-EXECUTOR OFFLINE BRIDGE ===");
console.log("NO API | NO ENV | TEMP FILES ONLY | NO TRADES");
const real = await planMissingNqFiles({ end: "2026-10-02", tradingSessions: 20, cacheRoot: "data/cache/massive/NQ" });
console.log("CACHE_ONLY_PLAN " + JSON.stringify({ firstDate: real.firstDate, lastDate: real.lastDate, candidates: real.candidates, rolloverReview: real.rolloverReview, policyVerified: false, approvedRequests: 0 }));
const temp = await mkdtemp(join(tmpdir(), "tm001-bridge-"));
try {
  const plan = await planMissingNqFiles({ end: "2026-10-02", tradingSessions: 20, cacheRoot: temp });
  if (plan.candidates.length < 3) throw Error("EXPECTED_OFFLINE_CANDIDATES");
  const targets = plan.candidates.slice(0, 3);
  let now = 0;
  const starts: number[] = [];
  const clock: Clock = { now: () => now, wait: async ms => { now += ms; } };
  const transport = pacedTransport(async (target: { ticker: string; date: string }) => {
    starts.push(now);
    return { status: "OK", results: [{ ticker: target.ticker, window_start: Date.parse(target.date + "T14:30:00Z") * 1_000_000, session_end_date: target.date, open: 100, high: 101, low: 99, close: 100.5, volume: 10 }] };
  }, { intervalMs: 15000, maxRequests: 3, clock });
  const result = await executeBoundedBackfill({ targets, maxRequests: 3, transport, persist: true, cacheRoot: temp });
  if (result.requests !== 3 || result.written !== 3 || starts.join(",") !== "0,15000,30000") throw Error("OFFLINE_BRIDGE_FAILED");
  console.log("OFFLINE_BRIDGE_RESULT " + JSON.stringify({ ...result, starts, temporaryCacheOnly: true }));
  console.log("TM001 PLANNER-EXECUTOR BRIDGE: GREEN (OFFLINE ONLY)");
} finally { await rm(temp, { recursive: true, force: true }); }

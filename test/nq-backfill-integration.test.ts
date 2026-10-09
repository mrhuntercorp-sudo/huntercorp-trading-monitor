import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executeBoundedBackfill } from "../src/scripts/massive-nq-backfill-safety.js";
import { pacedTransport, type Clock } from "../src/scripts/massive-nq-paced-transport.js";

const dates = ["2026-08-03", "2026-08-04", "2026-08-05"];
const targets = dates.map(date => ({ ticker: "NQU6", date }));
const fixture = ({ ticker, date }: { ticker: string; date: string }) => ({
  status: "OK",
  results: [{ ticker, window_start: Date.parse(date + "T14:30:00Z") * 1_000_000, session_end_date: date, open: 100, high: 101, low: 99, close: 100.5, volume: 10 }]
});
async function tempRoot<T>(fn: (root: string) => Promise<T>) {
  const root = await mkdtemp(join(tmpdir(), "tm001-integrated-"));
  try { return await fn(root); } finally { await rm(root, { recursive: true, force: true }); }
}

test("executor uses paced transport across three sequential requests", async () => tempRoot(async root => {
  let now = 0;
  const starts: number[] = [];
  const clock: Clock = { now: () => now, wait: async ms => { now += ms; } };
  const transport = pacedTransport(async target => { starts.push(now); return fixture(target); }, { intervalMs: 15000, maxRequests: 3, clock });
  const result = await executeBoundedBackfill({ targets, maxRequests: 3, transport, persist: false, cacheRoot: root });
  assert.deepEqual(starts, [0, 15000, 30000]);
  assert.deepEqual(result, { requests: 3, validated: 3, written: 0 });
}));

test("provider failure stops executor without reaching next target", async () => tempRoot(async root => {
  let calls = 0;
  const transport = pacedTransport(async target => {
    calls++;
    if (calls === 2) throw Error("HTTP_429");
    return fixture(target);
  }, { intervalMs: 15000, maxRequests: 3, clock: { now: () => calls * 15000, wait: async () => {} } });
  await assert.rejects(executeBoundedBackfill({ targets, maxRequests: 3, transport, persist: false, cacheRoot: root }), /HTTP_429/);
  assert.equal(calls, 2);
}));

test("request budget rejects before any integrated transport call", async () => tempRoot(async root => {
  let calls = 0;
  const transport = pacedTransport(async target => { calls++; return fixture(target); }, { intervalMs: 15000, maxRequests: 2 });
  await assert.rejects(executeBoundedBackfill({ targets, maxRequests: 2, transport, persist: false, cacheRoot: root }), /BUDGET_EXCEEDED_BEFORE_START/);
  assert.equal(calls, 0);
}));

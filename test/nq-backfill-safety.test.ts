import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { executeBoundedBackfill } from "../src/scripts/massive-nq-backfill-safety.js";

const target = { ticker: "NQU6", date: "2026-08-03" };
const bar = { ticker: target.ticker, window_start: Date.parse("2026-08-03T14:30:00Z") * 1_000_000, session_end_date: target.date, open: 100, high: 101, low: 99, close: 100.5, volume: 12 };
const good = () => ({ status: "OK", results: [{ ...bar }] });
const withRoot = async (run: (root: string) => Promise<void>) => {
  const root = await mkdtemp(join(tmpdir(), "tm001-backfill-"));
  try { await run(root); } finally { await rm(root, { recursive: true, force: true }); }
};

test("request budget rejects before transport", async () => withRoot(async root => {
  let calls = 0;
  await assert.rejects(executeBoundedBackfill({ targets: [target, { ...target, date: "2026-08-04" }], maxRequests: 1, cacheRoot: root, persist: false, transport: async () => { calls++; return good(); } }), /BUDGET_EXCEEDED_BEFORE_START/);
  assert.equal(calls, 0);
}));

test("pagination and bad OHLCV stop immediately", async () => withRoot(async root => {
  for (const response of [{ ...good(), next_url: "https://example.invalid/next" }, { status: "OK", results: [{ ...bar, low: 102 }] }]) {
    let calls = 0;
    await assert.rejects(executeBoundedBackfill({ targets: [target], maxRequests: 1, cacheRoot: root, persist: false, transport: async () => { calls++; return response; } }), /INVALID_OR_PAGINATED_PROVIDER_RESPONSE|INVALID_PROVIDER_OHLCV/);
    assert.equal(calls, 1);
  }
}));

test("duplicate timestamps fail closed", async () => withRoot(async root => {
  await assert.rejects(executeBoundedBackfill({ targets: [target], maxRequests: 1, cacheRoot: root, persist: false, transport: async () => ({ status: "OK", results: [{ ...bar }, { ...bar }] }) }), /DUPLICATE_PROVIDER_TIMESTAMP/);
}));

test("existing cache blocks transport and preserves bytes", async () => withRoot(async root => {
  const folder = join(root, target.ticker);
  await mkdir(folder, { recursive: true });
  const path = join(folder, target.date + ".json");
  await writeFile(path, "original", "utf8");
  let calls = 0;
  await assert.rejects(executeBoundedBackfill({ targets: [target], maxRequests: 1, cacheRoot: root, persist: true, transport: async () => { calls++; return good(); } }), /CACHE_ALREADY_EXISTS/);
  assert.equal(calls, 0);
  assert.equal(await readFile(path, "utf8"), "original");
}));

test("offline fixture persistence writes one verified cache in temp folder", async () => withRoot(async root => {
  const result = await executeBoundedBackfill({ targets: [target], maxRequests: 1, cacheRoot: root, persist: true, transport: async () => good() });
  assert.deepEqual(result, { requests: 1, validated: 1, written: 1 });
  const payload = JSON.parse(await readFile(join(root, target.ticker, target.date + ".json"), "utf8"));
  assert.equal(payload.bars.length, 1);
  assert.equal(payload.utcDate, target.date);
}));

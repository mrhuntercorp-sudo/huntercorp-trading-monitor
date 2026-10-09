import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { MinuteBar } from "../market/types.js";

// Offline harness only. Deliberately no network transport, env-file, or API key support.
const ROOT = "data/cache/massive/NQ";
type Target = { ticker: string; date: string };
type ProviderBar = { ticker: string; window_start: number; session_end_date: string; open: number; high: number; low: number; close: number; volume: number };
type ProviderResponse = { status: string; results: ProviderBar[]; next_url?: string };
type Transport = (target: Target) => Promise<ProviderResponse>;

export async function executeBoundedBackfill(args: {
  targets: Target[];
  maxRequests: number;
  transport: Transport;
  persist: boolean;
  cacheRoot?: string;
}): Promise<{ requests: number; validated: number; written: number }> {
  const { targets, maxRequests, transport, persist, cacheRoot = ROOT } = args;
  if (!Number.isSafeInteger(maxRequests) || maxRequests < 0 || maxRequests > 90) throw Error("INVALID_REQUEST_BUDGET");
  if (targets.length > maxRequests) throw Error("BUDGET_EXCEEDED_BEFORE_START");
  const seen = new Set<string>();
  for (const { ticker, date } of targets) {
    if (!/^NQ[HMUZ][0-9]$/.test(ticker) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date + "T00:00:00Z"))) throw Error("INVALID_TARGET");
    const id = ticker + ":" + date;
    if (seen.has(id)) throw Error("DUPLICATE_TARGET");
    seen.add(id);
  }
  let requests = 0, validated = 0, written = 0;
  for (const target of targets) {
    const destination = join(cacheRoot, target.ticker, target.date + ".json");
    try {
      await readFile(destination, "utf8");
      throw Error("CACHE_ALREADY_EXISTS: " + target.ticker + " " + target.date);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (requests >= maxRequests) throw Error("REQUEST_BUDGET_EXHAUSTED");
    requests++;
    // One call per target. No retry, pagination, or recovery after an error.
    const payload = await transport(target);
    if (payload.status !== "OK" || payload.next_url || !Array.isArray(payload.results) || payload.results.length === 0 || payload.results.length > 1440) throw Error("INVALID_OR_PAGINATED_PROVIDER_RESPONSE");
    const start = Date.parse(target.date + "T00:00:00Z");
    const bars: MinuteBar[] = [];
    for (const r of payload.results) {
      const timestampMs = Math.floor(r.window_start / 1_000_000);
      if (r.ticker !== target.ticker || !r.session_end_date || !Number.isFinite(r.window_start) || !Number.isSafeInteger(timestampMs) || timestampMs % 60000 !== 0 || timestampMs < start || timestampMs >= start + 86400000) throw Error("INVALID_PROVIDER_TIMESTAMP_OR_TICKER");
      if (![r.open, r.high, r.low, r.close, r.volume].every(v => typeof v === "number" && Number.isFinite(v)) || r.volume < 0 || r.low > Math.min(r.open, r.close) || r.high < Math.max(r.open, r.close) || r.low > r.high) throw Error("INVALID_PROVIDER_OHLCV");
      bars.push({ contractTicker: target.ticker, productCode: "NQ", timestampMs, sessionEndDate: r.session_end_date, open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume });
    }
    bars.sort((a,b) => a.timestampMs - b.timestampMs);
    if (bars.some((b,i) => i > 0 && b.timestampMs <= bars[i-1]!.timestampMs)) throw Error("DUPLICATE_PROVIDER_TIMESTAMP");
    validated++;
    if (persist) {
      // Never overwrite a cache file, even if created after preflight.
      await mkdir(join(cacheRoot, target.ticker), { recursive: true });
      const temp = destination + "." + process.pid + ".tmp";
      try {
        const sha256 = createHash("sha256").update(JSON.stringify(bars)).digest("hex");
        await writeFile(temp, JSON.stringify({ schema: 1, provider: "massive", ticker: target.ticker, productCode: "NQ", utcDate: target.date, sha256, bars }), { flag: "wx" });
        // Link fails if destination exists; unlike rename it does not replace an existing file.
        const { link, unlink } = await import("node:fs/promises");
        await link(temp, destination);
        await unlink(temp);
        written++;
      } finally { await rm(temp, { force: true }); }
    }
  }
  return { requests, validated, written };
}

async function main() {
  if (process.argv.includes("--execute")) throw Error("LIVE_ACQUISITION_DISABLED");
  const target = { ticker: "NQU6", date: "2026-08-03" };
  const fixture: Transport = async ({ ticker, date }) => ({
    status: "OK",
    results: [{ ticker, window_start: Date.parse(date + "T14:30:00Z") * 1_000_000, session_end_date: date, open: 100, high: 101, low: 99, close: 100.5, volume: 12 }]
  });
  const result = await executeBoundedBackfill({ targets: [target], maxRequests: 1, transport: fixture, persist: false });
  console.log("OFFLINE_BACKFILL_TEST " + JSON.stringify(result));
  let rejected = false;
  try {
    await executeBoundedBackfill({ targets: [target, { ticker: "NQU6", date: "2026-08-04" }], maxRequests: 1, transport: fixture, persist: false });
  } catch (error) { rejected = (error as Error).message === "BUDGET_EXCEEDED_BEFORE_START"; }
  if (!rejected) throw Error("BUDGET_GATE_TEST_FAILED");
  console.log("BUDGET_GATE_TEST GREEN");
  console.log("TM001 BACKFILL EXECUTION SAFETY: GREEN (OFFLINE ONLY, ZERO NETWORK, ZERO WRITES)");
}
if (process.argv[1]?.replace(/\\/g, "/").endsWith("/massive-nq-backfill-safety.ts")) await main();

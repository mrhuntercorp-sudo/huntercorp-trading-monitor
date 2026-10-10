// Explicitly approved single-request historical access probe.
// No pagination, retries, cache writes, order placement, or key logging.
const ticker = "NQU6";
const utcDate = "2026-08-21";
const execute = process.argv.includes("--execute");
console.log("=== TM001 MASSIVE FREE HISTORICAL ACCESS PROBE ===");
console.log("ONE REQUEST MAX | NO CACHE WRITES | NO TRADES | NO RETRIES");
console.log("TARGET " + ticker + " UTC " + utcDate + " (missing-cache candidate)");
if (!execute) {
  console.log("DRY_RUN: zero API calls; use --execute only for the approved one-request test");
  process.exit(0);
}
const key = process.env.MASSIVE_API_KEY?.trim();
if (!key) throw Error("MASSIVE_API_KEY missing; zero requests made");
const url = new URL("https://api.massive.com/futures/v1/aggs/" + ticker);
url.searchParams.set("resolution", "1min");
url.searchParams.set("window_start.gte", utcDate);
url.searchParams.set("window_start.lt", "2026-08-22");
url.searchParams.set("limit", "50000");
url.searchParams.set("sort", "window_start.asc");
url.searchParams.set("apiKey", key);
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 30000);
try {
  const response = await fetch(url, {signal:controller.signal,redirect:"error"});
  if (!response.ok) {
    console.log("ACCESS_RESULT " + JSON.stringify({httpStatus:response.status,success:false,requests:1,cacheWritten:false}));
    process.exitCode = 1;
  } else {
    const payload = await response.json() as {
      status?:string; results?:Array<{window_start?:number;open?:number;high?:number;low?:number;close?:number;volume?:number}>;next_url?:string;
    };
    const rows = payload.results;
    const valid = Array.isArray(rows) && rows.length>0 &&
      rows.every(r=>typeof r.window_start==="number" && Number.isFinite(r.window_start) &&
        [r.open,r.high,r.low,r.close,r.volume].every(v=>typeof v==="number" && Number.isFinite(v)));
    console.log("ACCESS_RESULT "+JSON.stringify({
      httpStatus:response.status,providerStatus:payload.status??null,
      bars:rows?.length??0,validBasicFields:valid,
      firstTimestampNs:rows?.[0]?.window_start??null,
      lastTimestampNs:rows?.at(-1)?.window_start??null,
      paginationRequired:Boolean(payload.next_url),
      requests:1,cacheWritten:false,tradePlaced:false,
      historicalAccessConfirmed:payload.status==="OK"&&valid,
    }));
    if(payload.status!=="OK"||!valid)process.exitCode=1;
  }
} finally {clearTimeout(timeout);}

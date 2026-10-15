/** TM001 delayed-data freshness gate. Cache-only; zero API calls.
 * A date is eligible for scoring only with a complete 390-minute RTH session.
 * A fresh-fetch recommendation is never automatic.
 */
import {CachedHistoricalDays} from "../research/historical-cache.js";
import {auditRthCoverage} from "../research/rth-coverage.js";
import {rthBars} from "../research/level-reclaim.js";
import {newYorkClock} from "../market/time.js";
const date=process.argv[2]??"2026-10-15",ticker="NQZ6";
if(!/^2026-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date+"T00:00:00Z")))throw Error("INVALID_DATE");
const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("CACHE_MISS_NETWORK_DISABLED");}});
console.log("=== TM001 E036 RTH FRESHNESS GATE ===");
let bars;
try{bars=await cache.getDay({ticker,productCode:"NQ"},date);}
catch(e){if((e as Error).message==="CACHE_MISS_NETWORK_DISABLED"){
 console.log("E036_GATE",JSON.stringify({date,ticker,status:"NO_CACHE",eligibleForScoring:false,
  requests:0,phonePublishes:0,orders:0}));process.exit(0);
}throw e;}
const rth=rthBars(bars,date),audit=auditRthCoverage(rth,date,ticker);
const latest=bars.at(-1)?.timestampMs??null;
const latestRth=rth.at(-1)?.timestampMs??null;
const now=Date.now();
const latestEt=latest===null?null:newYorkClock(latest);
const missing=audit.missingRanges.slice(0,5);
console.log("E036_GATE",JSON.stringify({date,ticker,status:audit.status,
 eligibleForScoring:audit.status==="COMPLETE",utcBars:bars.length,
 observedRthMinutes:audit.observedMinutes,missingRthMinutes:audit.missingMinutes,
 latestUtc:latest===null?null:new Date(latest).toISOString(),
 latestEt:latestEt===null?null:`${latestEt.date} ${String(latestEt.hour).padStart(2,"0")}:${String(latestEt.minute).padStart(2,"0")}`,
 latestRthUtc:latestRth===null?null:new Date(latestRth).toISOString(),
 missingRangesPreview:missing,
 nextAction:audit.status==="COMPLETE"?"RUN_FROZEN_REVIEW":"WAIT_FOR_COMPLETE_PROVIDER_HISTORY",
 requests:0,phonePublishes:0,orders:0}));

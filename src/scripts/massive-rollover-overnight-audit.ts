import { CachedHistoricalDays } from "../research/historical-cache.js";
import { inspectOvernightCoverage } from "../research/rollover-overnight-chain.js";
import { newYorkClock } from "../market/time.js";
import type { FuturesContract,MinuteBar } from "../market/types.js";
const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("CACHE ONLY: API forbidden");}});
const cycles=[
 {cycle:"2025-12",ticker:"NQH6",prior:"2025-12-12",roll:"2025-12-15"},
 {cycle:"2026-03",ticker:"NQM6",prior:"2026-03-13",roll:"2026-03-16"},
 {cycle:"2026-06",ticker:"NQU6",prior:"2026-06-12",roll:"2026-06-15"},
 {cycle:"2026-09",ticker:"NQZ6",prior:"2026-09-11",roll:"2026-09-14"}
] as const;
console.log("=== TM001 OVERNIGHT COVERAGE AND MULTI-ROLL READINESS ===");
console.log("CACHE ONLY | ZERO APIs | ZERO IMPUTATION | NO POLICY APPROVAL");
for(const c of cycles){
 const contract:FuturesContract={ticker:c.ticker,productCode:"NQ"};
 const [prior,roll]=await Promise.all([cache.getDay(contract,c.prior),cache.getDay(contract,c.roll)]);
 const combined:MinuteBar[]=[...prior,...roll];
 const coverage=inspectOvernightCoverage(combined,c.roll);
 const rollRth=roll.filter(b=>{const x=newYorkClock(b.timestampMs),m=x.hour*60+x.minute;
  return x.date===c.roll&&m>=570&&m<960;});
 console.log("OVERNIGHT_AUDIT "+JSON.stringify({cycle:c.cycle,ticker:c.ticker,
  cachedUtcDates:[c.prior,c.roll],coverage,rollRthBars:rollRth.length,
  note:"Missing Sunday UTC cache means overnight cannot be approved; no missing bars inferred"}));
 if(coverage.status==="COMPLETE")throw Error("Unexpected complete overnight from Friday/Monday UTC cache");
}
console.log("TM001 OVERNIGHT COVERAGE AUDIT: GREEN (FAIL-CLOSED; NO OVERNIGHT APPROVAL)");

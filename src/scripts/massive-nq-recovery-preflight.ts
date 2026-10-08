import { readdir } from "node:fs/promises";
import { join } from "node:path";
console.log("=== TM001 RECOVERY PREFLIGHT ===");
console.log("READ ONLY | ZERO API CALLS | ZERO SPEND | NO FETCH AUTHORIZATION");
const root="data/cache/massive/NQ";
const dates=["2026-09-16","2026-09-17","2026-09-18","2026-08-31","2026-09-01","2026-09-02","2026-09-03","2026-09-04"];
const plans=dates.map(date=>({date,ticker:date<"2026-09-14"?"NQU6":"NQZ6",reason:date.startsWith("2026-09-1")?"BRIDGE_RECENT_GAP":"EXTEND_PRE_ROLL_HISTORY"}));
for(const p of plans){
 const directory=join(root,p.ticker);
 const cached=(await readdir(directory)).filter(name=>/^[0-9]{4}-[0-9]{2}-[0-9]{2}[.]json$/.test(name));
 const utcDates=new Set(cached.map(name=>name.slice(0,10)));
 const previous=new Date(Date.parse(p.date+"T00:00:00Z")-86400000).toISOString().slice(0,10);
 const current=utcDates.has(p.date),prior=utcDates.has(previous);
 console.log("CANDIDATE "+JSON.stringify({...p,utcDateCached:current,previousUtcDateCached:prior,requiresUtcDayReview:!current||!prior}));
}
console.log("PREFLIGHT_SUMMARY "+JSON.stringify({candidateTradingDates:plans.length,minimumUtcDateRequestsNotCalculated:true,providerPaginationUnknown:true,requestLimitFreeTierPerMinute:5,publicListedBasicUsdPerMonth:0,accountEntitlementVerified:false,holidaySchedule:"2026-07-03 AND 2026-09-07 EXCLUDED FROM PILOT",rollConvention:"NQU6 THROUGH 2026-09-11; NQZ6 FROM 2026-09-14; NOT VALIDATED BY VOLUME",estimatedIncrementalSpendUsd:null,approvedApiCalls:0,approvedSpendUsd:0,warning:"Inspect existing fetch implementation, pagination, and provider account tier before authorizing requests"}));

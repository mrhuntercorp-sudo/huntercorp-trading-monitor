import { access, readdir } from "node:fs/promises";
import { join } from "node:path";
console.log("=== TM001 RECOVERY SAFETY GATE ===");
console.log("DRY RUN ONLY | NO ENV FILE | NO API KEY | NO NETWORK | NO MUTATIONS");
const root="data/cache/massive/NQ/NQZ6";
const candidates=["2026-09-16","2026-09-17","2026-09-18"] as const;
const files=new Set((await readdir(root)).filter(f=>/^[0-9]{4}-[0-9]{2}-[0-9]{2}[.]json$/.test(f)));
const utcNeeded=new Set<string>();
for(const date of candidates){
 const start=Date.parse(date+"T00:00:00Z");
 const previous=new Date(start-86400000).toISOString().slice(0,10);
 // RTH is on date; the 18:00 ET overnight start may fall on previous UTC date.
 for(const utcDate of [previous,date])if(!files.has(utcDate+".json"))utcNeeded.add(utcDate);
 console.log("TRADE_DATE "+JSON.stringify({date,ticker:"NQZ6",previousUtcDate:previous,previousCached:files.has(previous+".json"),currentCached:files.has(date+".json")}));
}
const needed=[...utcNeeded].sort();
const pageLimit=50000;
const theoreticalMaxBarsPerUtcDate=1440;
const expectedMinimumRequests=needed.length;
const paginationCannotBeRuledOut=true;
const approvedRequests=0;
console.log("DRY_RUN_SUMMARY "+JSON.stringify({contract:"NQZ6",tradeDates:candidates,uncachedUtcDates:needed,uncachedUtcDateCount:needed.length,expectedMinimumRequests,pageLimit,theoreticalMaxBarsPerUtcDate,paginationCannotBeRuledOut,accountEntitlementsVerified:false,approvedRequests,approvedSpendUsd:0,liveRecoveryEnabled:false,warning:"No fetch runner created. Inspect entitlements, provider rate limits and session continuity before live pilot."}));
if(!needed.length)console.log("ALREADY_CACHED: no acquisition required");
console.log("TM001 RECOVERY SAFETY GATE: GREEN (DRY RUN ONLY)");

import { MassiveHistoricalProvider } from "../providers/massive.js";
import { CachedHistoricalDays } from "../research/historical-cache.js";
import { expectedOvernightMinutes } from "./massive-overnight-cache-inventory.js";
import { newYorkClock } from "../market/time.js";
import type { FuturesContract } from "../market/types.js";

const key=process.env.MASSIVE_API_KEY?.trim();
if(!key)throw Error("MASSIVE_API_KEY missing; no recovery attempted");
const provider=new MassiveHistoricalProvider(key);
let lastRequest=0;
const cache=new CachedHistoricalDays({async getContractMinuteBars(contract,from,to){
 const delay=Math.max(0,13000-(Date.now()-lastRequest));
 if(delay)await new Promise<void>(resolve=>setTimeout(resolve,delay));
 lastRequest=Date.now();
 return provider.getContractMinuteBars(contract,from,to);
}});
const targets=[
 {cycle:"2025-12",ticker:"NQH6",date:"2025-12-14",roll:"2025-12-15"},
 {cycle:"2026-03",ticker:"NQM6",date:"2026-03-15",roll:"2026-03-16"},
 {cycle:"2026-06",ticker:"NQU6",date:"2026-06-14",roll:"2026-06-15"},
 {cycle:"2026-09",ticker:"NQZ6",date:"2026-09-13",roll:"2026-09-14"}
] as const;
console.log("=== TM001 AUTHORIZED FOUR-DATE SUNDAY CACHE RECOVERY ===");
console.log("ONLY FOUR NAMED UTC DATES | EXISTING MASSIVE PLAN | NO TRADING OR POLICY CHANGES");
for(const t of targets){
 const contract:FuturesContract={ticker:t.ticker,productCode:"NQ"};
 const bars=await cache.getDay(contract,t.date);
 const required=new Set(expectedOvernightMinutes(t.roll).filter(ms=>new Date(ms).toISOString().slice(0,10)===t.date));
 const present=new Set(bars.map(b=>b.timestampMs));
 const missing=[...required].filter(ms=>!present.has(ms));
 const selected=bars.filter(b=>required.has(b.timestampMs));
 console.log("SUNDAY_RECOVERY "+JSON.stringify({cycle:t.cycle,ticker:t.ticker,utcDate:t.date,
  requiredMinutes:required.size,presentMinutes:selected.length,missingMinutes:missing.length,
  firstMissingUtc:missing.length?new Date(missing[0]!).toISOString():null,
  status:missing.length===0?"COMPLETE":"REVIEW_REQUIRED"}));
 if(missing.length)console.log("WARNING: Sunday interval incomplete; do not approve overnight levels");
}
console.log("TM001 FOUR-DATE RECOVERY FINISHED (CACHE VALIDATED ON READ; NO OVERNIGHT APPROVAL)");

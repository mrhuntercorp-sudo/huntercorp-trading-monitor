/** Read-only OOS1 completeness gate; no signals, API calls, or writes. */
import {CachedHistoricalDays} from "../research/historical-cache.js";
import {auditRthCoverage} from "../research/rth-coverage.js";
import {overnightBars} from "../research/session-features.js";
import {newYorkClock} from "../market/time.js";
import type {MinuteBar} from "../market/types.js";
const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("NETWORK_DISABLED");}});
const contract={ticker:"NQZ6",productCode:"NQ" as const};
const dates=["2026-10-05","2026-10-06","2026-10-07","2026-10-08","2026-10-09"];
const utcDates=["2026-10-04",...dates];
const all:MinuteBar[]=[];
for(const date of utcDates){const bars=await cache.getDay(contract,date);all.push(...bars);}
all.sort((a,b)=>a.timestampMs-b.timestampMs);
let eligible=0;
for(const date of dates){
 const rth=all.filter(b=>{const c=newYorkClock(b.timestampMs),m=c.hour*60+c.minute;return c.date===date&&m>=570&&m<960;});
 const coverage=auditRthCoverage(rth,date,"NQZ6");
 const overnight=overnightBars(all,date);
 const overnightContinuous=overnight.length===930&&overnight.every((b,i)=>i===0||b.timestampMs-overnight[i-1]!.timestampMs===60000);
 const status=coverage.status==="COMPLETE"&&overnightContinuous?"ELIGIBLE":"QUARANTINED";
 if(status==="ELIGIBLE")eligible++;
 console.log("OOS1_SESSION",JSON.stringify({date,rthMinutes:coverage.observedMinutes,rthMissing:coverage.missingMinutes,missingRanges:coverage.missingRanges,overnightMinutes:overnight.length,overnightContinuous,status}));
}
console.log("OOS1_COVERAGE",JSON.stringify({candidateDates:dates.length,eligible,quarantined:dates.length-eligible,readOnly:true,apiRequests:0,strategyEvaluated:false}));
if(eligible!==dates.length)process.exitCode=1;

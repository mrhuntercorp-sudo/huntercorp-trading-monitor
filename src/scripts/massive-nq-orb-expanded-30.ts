import { CachedHistoricalDays } from "../research/historical-cache.js";
import { backtestConservativeOrb } from "../research/conservative-orb.js";
import { auditRthCoverage } from "../research/rth-coverage.js";
import { overnightBars } from "../research/session-features.js";
import { newYorkClock } from "../market/time.js";
import { provisionalClosedDates, provisionalNqContract, isProvisionalRoll } from "./massive-nq-calendar-policy.js";
import type { MinuteBar } from "../market/types.js";

const cache = new CachedHistoricalDays({async getContractMinuteBars(){throw Error("NETWORK_DISABLED_CACHE_ONLY");}});
const dayMs=86400000;
const dateOf=(ms:number)=>new Date(ms).toISOString().slice(0,10);
const dateMs=(s:string)=>Date.parse(s+"T00:00:00Z");
const end="2026-10-02";
const dates:string[]=[];
for(let ms=dateMs(end);dates.length<30;ms-=dayMs){
 const date=dateOf(ms),day=new Date(ms).getUTCDay();
 if(day!==0&&day!==6&&!provisionalClosedDates.has(date))dates.push(date);
}
dates.reverse();
const loaded=new Map<string,MinuteBar[]>();
async function load(ticker:string,date:string):Promise<MinuteBar[]>{
 const key=ticker+":"+date;
 if(!loaded.has(key))loaded.set(key,await cache.getDay({ticker,productCode:"NQ"},date));
 return loaded.get(key)!;
}
const excluded:{date:string;reason:string;detail?:string}[]=[];
const eligible:string[]=[];
const selected:MinuteBar[]=[];
console.log("=== TM001 30-SESSION CONSERVATIVE ORB RESEARCH ===");
console.log("CACHE ONLY | NO API | NO WRITES | NO TRADES | NOT STRATEGY APPROVAL");
for(const date of dates){
 const ticker=provisionalNqContract(date);
 const prior=dateOf(dateMs(date)-dayMs);
 const bars=[...await load(ticker,prior),...await load(ticker,date)].sort((a,b)=>a.timestampMs-b.timestampMs);
 const unique=new Set(bars.map(b=>b.timestampMs));
 if(unique.size!==bars.length){excluded.push({date,reason:"DUPLICATE_TIMESTAMPS"});continue;}
 const rth=bars.filter(b=>{const c=newYorkClock(b.timestampMs),m=c.hour*60+c.minute;return c.date===date&&m>=570&&m<960;});
 const overnight=overnightBars(bars,date);
 const overnightComplete=overnight.length===930&&overnight.every((b,i)=>i===0||b.timestampMs-overnight[i-1]!.timestampMs===60000);
 const rthStatus=auditRthCoverage(rth,date,ticker).status;
 if(isProvisionalRoll(date)){excluded.push({date,reason:"ROLLOVER_POLICY_UNVERIFIED"});continue;}
 if(rthStatus!=="COMPLETE"){excluded.push({date,reason:"INCOMPLETE_RTH",detail:String(rth.length)+"/390"});continue;}
 if(!overnightComplete){excluded.push({date,reason:"INCOMPLETE_OVERNIGHT",detail:String(overnight.length)+"/930"});continue;}
 eligible.push(date);
 selected.push(...rth);
}
const config={openingRangeMinutes:5 as const,stopPoints:40,targetPoints:40,contracts:1,
 friction:{roundTripCommissionUsd:6,slippageTicksPerSide:1}};
const result=backtestConservativeOrb(selected,config);
if(result.excluded.length)throw Error("UNEXPECTED_BACKTEST_EXCLUSIONS "+JSON.stringify(result.excluded));
const trades=[...result.trades].sort((a,b)=>a.date.localeCompare(b.date));
const sum=(items:typeof trades)=>items.reduce((s,t)=>s+t.netPnlUsd,0);
let equity=0,peak=0,maxDrawdown=0;
for(const t of trades){equity+=t.netPnlUsd;peak=Math.max(peak,equity);maxDrawdown=Math.max(maxDrawdown,peak-equity);}
const winners=trades.filter(t=>t.netPnlUsd>0),losers=trades.filter(t=>t.netPnlUsd<0);
const weeks=new Map<string,typeof trades>();
for(const t of trades){
 const d=new Date(t.date+"T00:00:00Z"),weekday=d.getUTCDay();
 d.setUTCDate(d.getUTCDate()-((weekday+6)%7));
 const monday=d.toISOString().slice(0,10);
 weeks.set(monday,[...(weeks.get(monday)??[]),t]);
}
console.log("ELIGIBILITY "+JSON.stringify({candidateDates:dates.length,eligibleDates:eligible.length,eligible,excluded,
 warning:"Calendar and contract-roll rules provisional; eligible means template-complete only"}));
console.log("SUMMARY "+JSON.stringify({config,eligibleSessions:eligible.length,trades:trades.length,
 noTradeSessions:eligible.length-trades.length,wins:winners.length,losses:losers.length,
 winRate:trades.length?winners.length/trades.length:null,netUsd:sum(trades),
 expectancyUsd:trades.length?sum(trades)/trades.length:null,maxDrawdownUsd:maxDrawdown,
 ambiguousExits:trades.filter(t=>t.ambiguousExit).length,
 gapThroughStops:trades.filter(t=>t.gapThroughStop).length,
 status:"EXPLORATORY_NOT_VALIDATED"}));
for(const [week,items] of weeks)console.log("WEEK "+JSON.stringify({weekStarting:week,trades:items.length,wins:items.filter(t=>t.netPnlUsd>0).length,netUsd:sum(items)}));
for(const t of trades)console.log("TRADE "+JSON.stringify({date:t.date,direction:t.direction,entry:t.entry,exit:t.exit,
 reason:t.exitReason,netUsd:t.netPnlUsd,ambiguousExit:t.ambiguousExit,gapThroughStop:t.gapThroughStop}));
console.log("TM001 EXPANDED ORB RESEARCH COMPLETE (NO STRATEGY APPROVAL)");

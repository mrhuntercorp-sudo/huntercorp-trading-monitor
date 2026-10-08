import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { CachedHistoricalDays } from "../research/historical-cache.js";
import { auditRthCoverage } from "../research/rth-coverage.js";
import { overnightBars } from "../research/session-features.js";
import { newYorkClock } from "../market/time.js";
import type { FuturesContract, MinuteBar } from "../market/types.js";

const root="data/cache/massive/NQ";
const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("CACHE ONLY: no network");}});
console.log("=== TM001 HISTORICAL CACHE COVERAGE AUDIT ===");
console.log("READ ONLY | NO API | NO MUTATIONS | NO STRATEGY APPROVAL");
const tickers=(await readdir(root,{withFileTypes:true})).filter(e=>e.isDirectory()&&/^NQ[A-Z][0-9]$/.test(e.name)).map(e=>e.name).sort();
if(!tickers.length)throw Error("No NQ contract cache directories");
const datePattern=/^\\d{4}-\\d{2}-\\d{2}\\.json$/;
const all=new Map<string,MinuteBar[]>();
let totalFiles=0;
for(const ticker of tickers){
 const contract:FuturesContract={ticker,productCode:"NQ"};
 const dates=(await readdir(join(root,ticker))).filter(name=>datePattern.test(name)).map(name=>name.slice(0,10)).sort();
 let barsCount=0;
 for(const date of dates){const bars=await cache.getDay(contract,date);all.set(ticker+"|"+date,bars);barsCount+=bars.length;totalFiles++;}
 console.log("CONTRACT "+JSON.stringify({ticker,cachedUtcDates:dates.length,firstUtcDate:dates[0]??null,lastUtcDate:dates.at(-1)??null,bars:barsCount}));
}
const dates=[...new Set([...all.values()].flatMap(bars=>bars.map(b=>newYorkClock(b.timestampMs).date)))].sort();
const eligible:{date:string;ticker:string}[]=[];
const quarantined:{date:string;reason:string}[]=[];
for(const date of dates){
 const candidates:{ticker:string;rth:MinuteBar[];overnight:MinuteBar[]}[]=[];
 for(const ticker of tickers){
  const bars=[...all.entries()].filter(([key])=>key.startsWith(ticker+"|")).flatMap(([,b])=>b);
  const rth=bars.filter(b=>{const c=newYorkClock(b.timestampMs),m=c.hour*60+c.minute;return c.date===date&&m>=570&&m<960;});
  if(!rth.length)continue;
  const coverage=auditRthCoverage(rth,date,ticker),on=overnightBars(bars,date);
  const complete=on.length===930&&on.every((b,i)=>i===0||b.timestampMs-on[i-1]!.timestampMs===60000);
  if(coverage.status==="COMPLETE"&&complete)candidates.push({ticker,rth,overnight:on});
 }
 if(candidates.length===1){eligible.push({date,ticker:candidates[0]!.ticker});console.log("ELIGIBLE "+JSON.stringify({date,ticker:candidates[0]!.ticker}));}
 else if(candidates.length>1){quarantined.push({date,reason:"MULTIPLE_CONTRACTS_NEED_CAUSAL_ROLL_SELECTION"});console.log("QUARANTINE "+JSON.stringify(quarantined.at(-1)));}
 else {
  const hasRth=[...all.values()].some(bars=>bars.some(b=>{const c=newYorkClock(b.timestampMs),m=c.hour*60+c.minute;return c.date===date&&m>=570&&m<960;}));
  if(hasRth){quarantined.push({date,reason:"NO_CONTRACT_WITH_COMPLETE_RTH_AND_OVERNIGHT"});console.log("QUARANTINE "+JSON.stringify(quarantined.at(-1)));}
 }
}
const uniqueEligible=[...new Set(eligible.map(e=>e.date))];
const gaps=uniqueEligible.flatMap((date,i)=>i===0?[]:[{previous:uniqueEligible[i-1],current:date}]).filter(pair=>{const a=Date.parse(pair.previous+"T00:00:00Z"),b=Date.parse(pair.current+"T00:00:00Z");return b-a>4*86400000;});
console.log("COVERAGE_SUMMARY "+JSON.stringify({contracts:tickers.length,cacheFiles:totalFiles,completeUniqueSessions:uniqueEligible.length,quarantinedSessions:quarantined.length,firstComplete:uniqueEligible[0]??null,lastComplete:uniqueEligible.at(-1)??null,largeCalendarGaps:gaps,canStudy20Days:uniqueEligible.length>=20,canStudy60Days:uniqueEligible.length>=60,rollSelectionApproved:false,warning:"Inventory only; multiple contract dates quarantined; no cross-roll backtest"}));
console.log("TM001 CACHE COVERAGE AUDIT: COMPLETE (DESCRIPTIVE ONLY)");

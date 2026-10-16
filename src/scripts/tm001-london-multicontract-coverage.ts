import {readdir} from "node:fs/promises";
import {join} from "node:path";
import {CachedHistoricalDays} from "../research/historical-cache.js";
import {newYorkClock} from "../market/time.js";
import type {FuturesContract,MinuteBar} from "../market/types.js";

const root="data/cache/massive/NQ";
const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("CACHE ONLY: network forbidden");}});
const tickers=(await readdir(root,{withFileTypes:true})).filter(x=>x.isDirectory()&&/^NQ[A-Z][0-9]$/.test(x.name)).map(x=>x.name).sort();
const byContract=new Map<string,Map<string,Map<number,MinuteBar>>>();
for(const ticker of tickers){
 const days=new Map<string,Map<number,MinuteBar>>();
 const contract:FuturesContract={ticker,productCode:"NQ"};
 const names=(await readdir(join(root,ticker))).filter(x=>/^\d{4}-\d{2}-\d{2}\.json$/.test(x)).sort();
 for(const name of names){
  const bars=await cache.getDay(contract,name.slice(0,10));
  for(const bar of bars){
   const c=newYorkClock(bar.timestampMs),minute=c.hour*60+c.minute;
   const day=days.get(c.date)??new Map<number,MinuteBar>();
   if(day.has(minute))throw Error("DUPLICATE_NY_MINUTE "+ticker+" "+c.date+" "+minute);
   day.set(minute,bar);days.set(c.date,day);
  }
 }
 byContract.set(ticker,days);
}
const missing=(day:Map<number,MinuteBar>,start:number,end:number)=>{let n=0;for(let m=start;m<end;m++)if(!day.has(m))n++;return n;};
const dates=[...new Set([...byContract.values()].flatMap(days=>[...days.keys()]))].sort();
console.log("=== TM001 MULTI-CONTRACT LONDON SWEEP COVERAGE ===");
console.log("RULES "+JSON.stringify({readOnly:true,apiCalls:0,writes:0,orders:0,signalsCalculated:false,rollSelectionApproved:false,windowsEt:{london:"02:00-08:59",signal:"09:30-10:59",exitCoverage:"11:00-11:29"}}));
let unique=0,ambiguous=0,partial=0;
for(const date of dates){
 const candidates:string[]=[];
 const diagnostics:object[]=[];
 for(const ticker of tickers){
  const day=byContract.get(ticker)!.get(date);
  if(!day)continue;
  const londonMissing=missing(day,120,540),signalMissing=missing(day,570,660),exitMissing=missing(day,660,690);
  diagnostics.push({ticker,londonMissing,signalMissing,exitMissing});
  if(londonMissing===0&&signalMissing===0&&exitMissing===0)candidates.push(ticker);
 }
 if(!diagnostics.length)continue;
 const status=candidates.length===1?"UNIQUE_COMPLETE":candidates.length>1?"ROLL_REVIEW": "INCOMPLETE";
 if(status==="UNIQUE_COMPLETE")unique++;else if(status==="ROLL_REVIEW")ambiguous++;else partial++;
 console.log("LONDON_COVERAGE "+JSON.stringify({date,status,completeContracts:candidates,diagnostics,postBaseline:date>"2026-10-09"}));
}
console.log("COVERAGE_SUMMARY "+JSON.stringify({contracts:tickers.length,dates:dates.length,uniqueComplete:unique,rollReview:ambiguous,incomplete:partial,apiCalls:0,writes:0,orders:0,warning:"Coverage only; no strategy evaluation or approval. Older dates are retrospective holdout candidates, not forward validation."}));

import {CachedHistoricalDays} from "../research/historical-cache.js";
import {auditRthCoverage} from "../research/rth-coverage.js";
import {overnightBars} from "../research/session-features.js";
import {newYorkClock} from "../market/time.js";
import {provisionalClosedDates,provisionalNqContract,isProvisionalRoll} from "./massive-nq-calendar-policy.js";
import {overnightSweepReclaims,openingRangeBreakoutRetest} from "../research/p3-nq-signals.js";
import type {MinuteBar} from "../market/types.js";

console.log("TM001 P3 CACHED SIGNAL SCREEN | NO API | NO WRITES | NO TRADES");
const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("NETWORK_DISABLED");}});
const ms=(s:string)=>Date.parse(s+"T00:00:00Z"),iso=(t:number)=>new Date(t).toISOString().slice(0,10),dayMs=86400000;
const dates:string[]=[];for(let t=ms("2026-10-02");dates.length<30;t-=dayMs){const d=iso(t),w=new Date(t).getUTCDay();if(w!==0&&w!==6&&!provisionalClosedDates.has(d))dates.push(d);}dates.reverse();
const loaded=new Map<string,MinuteBar[]>();
async function load(ticker:string,date:string){const key=ticker+":"+date;if(!loaded.has(key))loaded.set(key,await cache.getDay({ticker,productCode:"NQ"},date));return loaded.get(key)!;}
const counts={ON_SWEEP_RECLAIM_V1:0,ORB_RETEST_V1:0};
const excluded:{date:string;reason:string}[]=[];
const perDay:{date:string;overnightSweeps:number;orbRetests:number}[]=[];
for(const date of dates){
 const ticker=provisionalNqContract(date),prior=iso(ms(date)-dayMs);
 const bars=[...await load(ticker,prior),...await load(ticker,date)].sort((a,b)=>a.timestampMs-b.timestampMs);
 if(new Set(bars.map(b=>b.timestampMs)).size!==bars.length){excluded.push({date,reason:"DUPLICATE_TIMESTAMPS"});continue;}
 const rth=bars.filter(b=>{const c=newYorkClock(b.timestampMs),m=c.hour*60+c.minute;return c.date===date&&m>=570&&m<960;});
 const overnight=overnightBars(bars,date);
 if(isProvisionalRoll(date)){excluded.push({date,reason:"ROLLOVER_UNVERIFIED"});continue;}
 if(auditRthCoverage(rth,date,ticker).status!=="COMPLETE"){excluded.push({date,reason:"INCOMPLETE_RTH"});continue;}
 if(overnight.length!==930||overnight.some((b,i)=>i>0&&b.timestampMs-overnight[i-1]!.timestampMs!==60000)){excluded.push({date,reason:"INCOMPLETE_OVERNIGHT"});continue;}
 const high=Math.max(...overnight.map(b=>b.high)),low=Math.min(...overnight.map(b=>b.low));
 const sweeps=overnightSweepReclaims(rth,high,low),retests=openingRangeBreakoutRetest(rth);
 const rthTimes=new Set(rth.map(b=>b.timestampMs));
 for(const signal of [...sweeps,...retests])if(signal.entryTime<=signal.signalTime||!rthTimes.has(signal.entryTime))throw Error("INVALID_NEXT_BAR_ENTRY "+date);
 counts.ON_SWEEP_RECLAIM_V1+=sweeps.length;counts.ORB_RETEST_V1+=retests.length;
 perDay.push({date,overnightSweeps:sweeps.length,orbRetests:retests.length});
}
if(perDay.length+excluded.length!==dates.length)throw Error("ELIGIBILITY_ACCOUNTING_FAILURE");
console.log("P3_ELIGIBILITY "+JSON.stringify({candidateSessions:dates.length,eligibleSessions:perDay.length,excluded,provisionalCalendarAndRoll:true}));
console.log("P3_SIGNAL_COUNTS "+JSON.stringify({counts,perDay,entry:"next RTH minute open",overnightLevels:"18:00 previous calendar day through 09:29 ET; complete before RTH",openingRange:"09:30-09:34 ET; confirmed close and subsequent retest",limitations:"IN_SAMPLE_SIGNAL_FREQUENCY_ONLY; no stops/targets, PnL, commissions, slippage, EOD MLL or profit validation"}));
console.log("TM001 P3 CACHED SIGNAL SCREEN COMPLETE | NO API | NO TRADES | NOT PROFIT VALIDATED");

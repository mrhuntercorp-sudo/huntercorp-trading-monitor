import { CachedHistoricalDays } from "../research/historical-cache.js";
import { backtestConservativeOrb } from "../research/conservative-orb.js";
import { auditRthCoverage } from "../research/rth-coverage.js";
import { overnightBars } from "../research/session-features.js";
import { newYorkClock } from "../market/time.js";
import { provisionalClosedDates, provisionalNqContract, isProvisionalRoll } from "./massive-nq-calendar-policy.js";
import type { MinuteBar } from "../market/types.js";

console.log("=== TM001 COMBINE EOD TRAILING MLL + INTRADAY STRESS ===");
console.log("CACHE ONLY | ZERO API | ZERO WRITES | ZERO TRADES | RESEARCH PROXY");
const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("NETWORK_DISABLED");}});
const ms=(s:string)=>Date.parse(s+"T00:00:00Z"),iso=(t:number)=>new Date(t).toISOString().slice(0,10),dayMs=86400000;
const dates:string[]=[];for(let t=ms("2026-10-02");dates.length<30;t-=dayMs){const d=iso(t),w=new Date(t).getUTCDay();if(w!==0&&w!==6&&!provisionalClosedDates.has(d))dates.push(d);}dates.reverse();
const loaded=new Map<string,MinuteBar[]>();
async function load(ticker:string,date:string){const k=ticker+":"+date;if(!loaded.has(k))loaded.set(k,await cache.getDay({ticker,productCode:"NQ"},date));return loaded.get(k)!;}
const selected:MinuteBar[]=[],excluded:{date:string;reason:string}[]=[];
for(const date of dates){
 const ticker=provisionalNqContract(date),prior=iso(ms(date)-dayMs);
 const bars=[...await load(ticker,prior),...await load(ticker,date)].sort((a,b)=>a.timestampMs-b.timestampMs);
 if(new Set(bars.map(b=>b.timestampMs)).size!==bars.length){excluded.push({date,reason:"DUPLICATE_TIMESTAMPS"});continue;}
 const rth=bars.filter(b=>{const c=newYorkClock(b.timestampMs),m=c.hour*60+c.minute;return c.date===date&&m>=570&&m<960;});
 const overnight=overnightBars(bars,date);
 if(isProvisionalRoll(date)){excluded.push({date,reason:"ROLLOVER_UNVERIFIED"});continue;}
 if(auditRthCoverage(rth,date,ticker).status!=="COMPLETE"){excluded.push({date,reason:"INCOMPLETE_RTH"});continue;}
 if(overnight.length!==930||overnight.some((b,i)=>i>0&&b.timestampMs-overnight[i-1]!.timestampMs!==60000)){excluded.push({date,reason:"INCOMPLETE_OVERNIGHT"});continue;}
 selected.push(...rth);
}
const byDate=new Map<string,MinuteBar[]>();for(const b of selected){const d=newYorkClock(b.timestampMs).date;const arr=byDate.get(d)??[];arr.push(b);byDate.set(d,arr);}
console.log("ELIGIBILITY "+JSON.stringify({candidateDates:dates.length,eligibleSessions:byDate.size,excluded,provisionalCalendarAndRoll:true}));
console.log("RULE_ASSUMPTIONS "+JSON.stringify({startingBalanceUsd:50000,startingBalanceArbitrary:true,combineMllUsd:[2000,3000],mllTrailsEodBalance:true,mllFloorStopsAtStartingBalance:true,intradayUnrealizedEquityChecks:true,minuteBarWorstExtreme:true,commissionMnqRoundTripPerContractUsd:2,slippageTicksPerSide:3,dailyStopBudgetFractionOfMll:0.15,operatingDrawdownFractionOfMll:0.5,source:"NQ minute bars as MNQ price-path proxy",limitations:"minute-bar intrabar ordering unknown; extreme checked conservatively even on exit bar; no true orderbook/fills; account-specific Topstep rules unverified; profit target/consistency not modeled"}));
for(const [stopPoints,targetPoints] of [[20,40],[20,60],[40,40],[40,120]] as const){
 const r=backtestConservativeOrb(selected,{openingRangeMinutes:5,stopPoints,targetPoints,contracts:1,friction:{roundTripCommissionUsd:0,slippageTicksPerSide:0}});
 if(r.excluded.length)throw Error("MODEL_EXCLUSIONS "+JSON.stringify(r.excluded));
 const trades=[...r.trades].sort((a,b)=>a.date.localeCompare(b.date));
 for(const contractsMnq of [1,2,3,5]){
  for(const mll of [2000,3000]){
   const start=50000,fee=5*contractsMnq,pointValue=2*contractsMnq;
   let balance=start,highestEod=start,breachedAt:string|null=null,operatingStopAt:string|null=null,dailyStopCount=0,executed=0,skipped=0,minCushion=mll;
   const dayLossBudget=mll*0.15,operatingBudget=mll*0.5;
   for(const t of trades){
    if(breachedAt!==null||operatingStopAt!==null){skipped++;continue;}
    const floor=Math.min(start,highestEod-mll);
    const bars=byDate.get(t.date)!;
    const startIndex=bars.findIndex(b=>b.timestampMs===t.entryTimestampMs);
    if(startIndex<0)throw Error("ENTRY_BAR_MISSING "+t.date);
    const stop=t.direction==="LONG"?t.entry-stopPoints:t.entry+stopPoints;
    const target=t.direction==="LONG"?t.entry+targetPoints:t.entry-targetPoints;
    let adverse=0,exitSeen=false;
    for(const b of bars.slice(startIndex)){
     const stopHit=t.direction==="LONG"?b.low<=stop:b.high>=stop;
     const targetHit=t.direction==="LONG"?b.high>=target:b.low<=target;
     const worst=t.direction==="LONG"?b.low:b.high;
     const unrealized=(worst-t.entry)*(t.direction==="LONG"?1:-1)*pointValue-fee;
     adverse=Math.min(adverse,unrealized);
     minCushion=Math.min(minCushion,balance+unrealized-floor);
     if(balance+unrealized<=floor&&breachedAt===null)breachedAt=t.date;
     if(stopHit||targetHit){exitSeen=true;break;}
    }
    if(!exitSeen&&t.exitReason!=="SESSION_END")throw Error("EXIT_RECONCILIATION "+t.date);
    const realized=(t.exit-t.entry)*(t.direction==="LONG"?1:-1)*pointValue-fee;
    executed++;
    if(adverse<=-dayLossBudget)dailyStopCount++;
    balance+=realized;
    highestEod=Math.max(highestEod,balance);
    if(start-balance>=operatingBudget&&operatingStopAt===null)operatingStopAt=t.date;
   }
   console.log("SCENARIO "+JSON.stringify({stopPoints,targetPoints,contractsMnq,mllUsd:mll,operatingBudgetUsd:operatingBudget,dailyLossBudgetUsd:dayLossBudget,executedTrades:executed,skippedTrades:skipped,simulatedNetUsd:Number((balance-start).toFixed(2)),mllFirstTouchDate:breachedAt,operatingStopDate:operatingStopAt,daysExceedingDailyBudget:dailyStopCount,minimumIntradayCushionUsd:Number(minCushion.toFixed(2)),status:breachedAt?"MLL_TOUCH":operatingStopAt?"OPERATING_STOP":"NO_TOUCH_IN_SAMPLE"}));
  }
 }
}
console.log("TM001 COMBINE RESEARCH COMPLETE | NOT ACCOUNT RULE CERTIFICATION | NO STRATEGY APPROVAL");

/** E025: independent assertions of E024's chronology and fill assumptions. Read only. */
import {CachedHistoricalDays} from "../research/historical-cache.js";
import {auditRthCoverage} from "../research/rth-coverage.js";
import {rthBars} from "../research/level-reclaim.js";
import {firstWickRejection} from "../research/wick-rejection.js";
import {simulateFixedShort,FIXED_SHORT_RULES} from "../research/fixed-short-feasibility.js";
import {newYorkClock} from "../market/time.js";
import {provisionalClosedDates,provisionalNqContract,isProvisionalRoll} from "./massive-nq-calendar-policy.js";
import type {MinuteBar} from "../market/types.js";
const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("NETWORK_DISABLED");}});
const iso=(t:number)=>new Date(t).toISOString().slice(0,10),ms=(s:string)=>Date.parse(s+"T00:00:00Z");
const end=process.argv[2]??"2026-10-02";
if(!/^\d{4}-\d{2}-\d{2}$/.test(end)||!Number.isFinite(ms(end))||iso(ms(end))!==end)throw Error("INVALID_END_DATE");
const dates:string[]=[];
for(let t=ms(end);dates.length<30;t-=86400000){const d=iso(t),w=new Date(t).getUTCDay();if(w!==0&&w!==6&&!provisionalClosedDates.has(d))dates.push(d);}
dates.reverse();
const clock=(b:MinuteBar)=>{const c=newYorkClock(b.timestampMs);return {date:c.date,minute:c.hour*60+c.minute};};
const loaded=new Map<string,MinuteBar[]>();
async function load(ticker:string,date:string){const k=ticker+"|"+date;if(!loaded.has(k))loaded.set(k,await cache.getDay({ticker,productCode:"NQ"},date));return loaded.get(k)!;}
function assert(ok:unknown,message:string):asserts ok{if(!ok)throw Error("AUDIT_FAIL:"+message);}
const exclusions:{date:string;reason:string}[]=[],auditRows:{date:string;signalUtc:string;entryUtc:string;londonHigh:number;signalHigh:number;signalClose:number;entry:number;exit:number;net:number;reason:string;maxPreExitAdverse:number}[]=[];
let eligible=0,noSweep=0,late=0,checks=0;
for(const date of dates){
 const ticker=provisionalNqContract(date);
 if(isProvisionalRoll(date)){exclusions.push({date,reason:"PROVISIONAL_ROLL"});continue;}
 let bars:MinuteBar[];
 try{bars=[...await load(ticker,iso(ms(date)-86400000)),...await load(ticker,date)].sort((a,b)=>a.timestampMs-b.timestampMs);}
 catch(e){exclusions.push({date,reason:e instanceof Error&&e.message.includes("NETWORK_DISABLED")?"MISSING_CACHE":String(e)});continue;}
 try{
  assert(new Set(bars.map(b=>b.timestampMs)).size===bars.length,"DUPLICATE");
  const day=rthBars(bars,date);
  if(auditRthCoverage(day,date,ticker).status!=="COMPLETE"){exclusions.push({date,reason:"INCOMPLETE_RTH"});continue;}
  const london=bars.filter(b=>{const c=clock(b);return c.date===date&&c.minute>=120&&c.minute<540;});
  if(london.length!==420||london.some((b,i)=>i>0&&b.timestampMs-london[i-1]!.timestampMs!==60000)){
   exclusions.push({date,reason:"INCOMPLETE_LONDON"});continue;
  }
  eligible++;
  const londonHigh=Math.max(...london.map(b=>b.high)),lastLondon=london.at(-1)!;
  assert(clock(lastLondon).minute===539,"LONDON_END");
  assert(lastLondon.timestampMs<day[0]!.timestampMs,"LEVEL_MUST_BE_KNOWN_BEFORE_RTH");
  checks+=2;
  const sweep=firstWickRejection(day,{kind:"OVERNIGHT_HIGH",price:londonHigh,side:"HIGH",knownAtIndex:0});
  if(!sweep){noSweep++;continue;}
  const signal=day[sweep.barIndex]!,next=day[sweep.barIndex+1];
  assert(signal.high>londonHigh&&signal.close<londonHigh,"STRICT_SWEEP_REJECTION");
  assert(day.slice(0,sweep.barIndex).every(b=>!(b.high>londonHigh&&b.close<londonHigh)),"FIRST_SWEEP");
  checks+=2;
  if(!next||clock(next).minute>=660){late++;continue;}
  assert(next.timestampMs-signal.timestampMs===60000,"ENTRY_NEXT_MINUTE");
  assert(next.timestampMs>lastLondon.timestampMs,"ENTRY_AFTER_LEVEL_COMPLETE");
  assert(clock(next).minute>=570&&clock(next).minute<660,"ENTRY_WINDOW");
  const sim=simulateFixedShort(day,sweep.barIndex);
  assert(sim!==null,"SIMULATION_PRESENT");
  assert(sim.entryIndex===sweep.barIndex+1&&sim.entryPrice===next.open,"ENTRY_AT_NEXT_OPEN");
  assert(sim.exitIndex>=sim.entryIndex&&sim.exitIndex<sim.entryIndex+FIXED_SHORT_RULES.maxBars,"EXIT_WINDOW");
  assert(Math.abs(sim.netPoints-(sim.grossPoints-FIXED_SHORT_RULES.roundTripCostPoints))<1e-9,"COST_APPLIED_ONCE");
  checks+=7;
  const stop=sim.entryPrice+40,target=sim.entryPrice-40;
  for(let i=sim.entryIndex;i<=sim.exitIndex;i++){
   const b=day[i]!;
   assert(b.high>=Math.max(b.open,b.close)&&b.low<=Math.min(b.open,b.close),"OHLC_VALID");
   if(i<sim.exitIndex)assert(b.high<stop&&b.low>target,"NO_SKIPPED_EARLIER_EXIT");
   checks++;
  }
  const last=day[sim.exitIndex]!;
  if(sim.reason==="STOP"){
   assert(last.high>=stop||last.open>=stop,"STOP_WAS_TOUCHED");
   assert(sim.exitPrice>=stop,"STOP_NOT_FILLED_BETTER");
  }else if(sim.reason==="TARGET"){
   assert(last.low<=target||last.open<=target,"TARGET_WAS_TOUCHED");
   assert(sim.exitPrice===target,"TARGET_FILL_NOT_IMPROVED");
  }else{
   assert(sim.exitIndex===sim.entryIndex+9&&sim.exitPrice===last.close,"TIME_EXIT_EXACT");
  }
  checks+=2;
  const maxPreExitAdverse=Math.max(0,...day.slice(sim.entryIndex,sim.exitIndex+1).map(b=>b.high-sim.entryPrice));
  auditRows.push({date,signalUtc:new Date(signal.timestampMs).toISOString(),entryUtc:new Date(next.timestampMs).toISOString(),
   londonHigh,signalHigh:signal.high,signalClose:signal.close,entry:sim.entryPrice,exit:sim.exitPrice,
   net:sim.netPoints,reason:sim.reason,maxPreExitAdverse:Math.round(maxPreExitAdverse*100)/100});
 }catch(e){if(e instanceof Error&&e.message.startsWith("AUDIT_FAIL:"))throw Error(date+" "+e.message);throw e;}
}
const net=auditRows.reduce((s,x)=>s+x.net,0);
console.log("=== TM001 E025 LONDON SWEEP CAUSALITY / FILL AUDIT ===");
console.log("IN_SAMPLE_REPLAY | CACHE_ONLY | ZERO_API | ZERO_ORDERS | NO_OPTIMIZATION | NO_OOS_CLAIM");
console.log("COVERAGE",JSON.stringify({requested:dates.length,eligible,exclusions,noSweep,late}));
console.log("AUDIT",JSON.stringify({trades:auditRows.length,checks,netPoints:net,
 matchesE024Default:auditRows.length===11&&net===283,
 maxObservedAdversePoints:Math.max(0,...auditRows.map(x=>x.maxPreExitAdverse)),
 warnings:["One-minute OHLC cannot prove intrabar order","London ET window is provisional","Same historical sample as E024","RTH gaps beyond tested cohort not independently verified"]}));
console.log("ROWS",JSON.stringify(auditRows));
if(end==="2026-10-02")assert(auditRows.length===11&&net===283,"E024_REGRESSION_MISMATCH");
console.log("E025_COMPLETE",JSON.stringify({regressionGreen:true,noApi:true,noOrders:true,independentValidation:false}));

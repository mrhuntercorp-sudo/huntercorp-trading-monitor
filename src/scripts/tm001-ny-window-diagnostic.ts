/** In-sample NY entry-window comparison; 10m locked baseline, 30m paired diagnostic. */
import {CachedHistoricalDays} from "../research/historical-cache.js";
import {auditRthCoverage} from "../research/rth-coverage.js";
import {overnightBars} from "../research/session-features.js";
import {knownLevels,rthBars} from "../research/level-reclaim.js";
import {firstWickRejection} from "../research/wick-rejection.js";
import {marketContextAt} from "../research/market-context.js";
import {simulateFixedShort,FIXED_SHORT_RULES} from "../research/fixed-short-feasibility.js";
import {newYorkClock} from "../market/time.js";
import {provisionalClosedDates,provisionalNqContract,isProvisionalRoll} from "./massive-nq-calendar-policy.js";
import type {MinuteBar} from "../market/types.js";
const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("NETWORK_DISABLED");}});
const ms=(s:string)=>Date.parse(s+"T00:00:00Z"),iso=(t:number)=>new Date(t).toISOString().slice(0,10);
const dates:string[]=[];for(let t=ms("2026-10-02");dates.length<30;t-=86400000){const d=iso(t),w=new Date(t).getUTCDay();if(w!==0&&w!==6&&!provisionalClosedDates.has(d))dates.push(d);}dates.reverse();
const loaded=new Map<string,Awaited<ReturnType<typeof cache.getDay>>>();
async function load(ticker:string,date:string){const k=ticker+"|"+date;if(!loaded.has(k))loaded.set(k,await cache.getDay({ticker,productCode:"NQ"},date));return loaded.get(k)!;}
const windows=[{name:"NY_OPEN",start:570,end:660},{name:"MIDDAY",start:660,end:780},{name:"AFTERNOON",start:780,end:960}] as const;
type Result={net:number;reason:"STOP"|"TARGET"|"TIME";exitIndex:number};
type Trade={date:string;entryMinutes:number;exitMinutes:number;window:string;baseline:Result;extended:Result|null};
const trades:Trade[]=[];let eligible=0,excluded=0,candidates=0,collapsed=0,skippedOverlap=0,skippedLate=0,missing30=0,parity=0;
const minute=(ts:number)=>{const c=newYorkClock(ts);return c.hour*60+c.minute;};
const classify=(m:number)=>windows.find(w=>m>=w.start&&m<w.end)?.name??"OUTSIDE_RTH";
function thirty(day:readonly MinuteBar[],index:number):Result|null{
 if(index+30>=day.length)return null;
 const entryIndex=index+1,entry=day[entryIndex]!.open,stop=entry+FIXED_SHORT_RULES.stopPoints,target=entry-FIXED_SHORT_RULES.targetPoints;
 for(let i=entryIndex;i<entryIndex+30;i++){
  const b=day[i]!;
  if(b.high<b.low||b.high<Math.max(b.open,b.close)||b.low>Math.min(b.open,b.close))throw Error("INVALID_BAR");
  if(i>entryIndex&&b.open>=stop)return {net:entry-b.open-2,reason:"STOP",exitIndex:i};
  if(i>entryIndex&&b.open<=target)return {net:entry-target-2,reason:"TARGET",exitIndex:i};
  if(b.high>=stop)return {net:-42,reason:"STOP",exitIndex:i};
  if(b.low<=target)return {net:38,reason:"TARGET",exitIndex:i};
 }
 const exitIndex=entryIndex+29;
 return {net:entry-day[exitIndex]!.close-2,reason:"TIME",exitIndex};
}
console.log("=== TM001 NY ENTRY WINDOW DIAGNOSTIC ===");
console.log("IN_SAMPLE | CACHE_ONLY | ZERO_API | ZERO_ORDERS | NO_WINDOW_SELECTION");
console.log("WINDOW_RULES",JSON.stringify({windows,classification:"NEXT_BAR_ENTRY_TIME_ET",baselineMaxBars:10,pairedMaxBars:30,baselineSelection:"LOCKED_10M_NON_OVERLAP",extended30:"SAME_BASELINE_ENTRIES_NOT_EXECUTABLE_PORTFOLIO",stopPoints:40,targetPoints:40,assumedRoundTripCostPoints:2}));
for(const date of dates){
 const ticker=provisionalNqContract(date),prior=iso(ms(date)-86400000);
 const bars=[...await load(ticker,prior),...await load(ticker,date)].sort((a,b)=>a.timestampMs-b.timestampMs);
 const day=rthBars(bars,date),overnight=overnightBars(bars,date);
 if(isProvisionalRoll(date)||auditRthCoverage(day,date,ticker).status!=="COMPLETE"||overnight.length!==930||overnight.some((b,i)=>i>0&&b.timestampMs-overnight[i-1]!.timestampMs!==60000)||new Set(bars.map(b=>b.timestampMs)).size!==bars.length){excluded++;continue;}
 eligible++;const levels=knownLevels(day,overnight),events=new Set<number>();
 for(const level of levels){
  const e=firstWickRejection(day,level);if(!e||e.direction!=="SHORT")continue;
  const net=marketContextAt(day,levels,e.barIndex).trailingFiveNetPoints;
  if(net===null||net<=0)continue;
  candidates++;if(events.has(e.barIndex)){collapsed++;continue;}events.add(e.barIndex);
 }
 let busyThrough=-1;
 for(const index of [...events].sort((a,b)=>a-b)){
  if(index<=busyThrough){skippedOverlap++;continue;}
  const sim=simulateFixedShort(day,index);if(!sim){skippedLate++;continue;}
  busyThrough=sim.exitIndex;
  const entryMinutes=minute(day[sim.entryIndex]!.timestampMs),exitMinutes=minute(day[sim.exitIndex]!.timestampMs);
  const window=classify(entryMinutes);if(window==="OUTSIDE_RTH")throw Error("ENTRY_OUTSIDE_RTH");
  const extended=thirty(day,index);if(!extended)missing30++;
  trades.push({date,entryMinutes,exitMinutes,window,baseline:{net:sim.netPoints,reason:sim.reason,exitIndex:sim.exitIndex},extended});
 }
}
const round=(n:number)=>Math.round(n*100)/100;
function report(window:string,horizon:10|30){
 const subset=trades.filter(t=>(window==="ALL_RTH"||t.window===window)&&(horizon===10||t.extended!==null));
 const values=subset.map(t=>horizon===10?t.baseline:t.extended!);
 const sessions=[...new Set(subset.map(t=>t.date))],daily=sessions.map(d=>subset.filter(t=>t.date===d).reduce((s,t)=>s+(horizon===10?t.baseline:t.extended!).net,0));
 let equity=0,peak=0,drawdown=0;
 for(const v of values){equity+=v.net;peak=Math.max(peak,equity);drawdown=Math.max(drawdown,peak-equity);}
 const boundaries=windows.find(w=>w.name===window);
 const crossed=boundaries?subset.filter(t=>{return t.exitMinutes>=boundaries.end&&horizon===10;}).length:null;
 console.log("WINDOW_RESULT",JSON.stringify({window,maxHoldMinutes:horizon,trades:subset.length,distinctSessions:sessions.length,wins:values.filter(v=>v.net>0).length,losses:values.filter(v=>v.net<0).length,stops:values.filter(v=>v.reason==="STOP").length,targets:values.filter(v=>v.reason==="TARGET").length,timeExits:values.filter(v=>v.reason==="TIME").length,totalNetPoints:round(values.reduce((s,v)=>s+v.net,0)),averageNetPointsPerTrade:values.length?round(values.reduce((s,v)=>s+v.net,0)/values.length):null,positiveSessions:daily.filter(n=>n>0).length,negativeSessions:daily.filter(n=>n<0).length,worstSessionPoints:daily.length?round(Math.min(...daily)):null,maxClosedTradeDrawdownPoints:round(drawdown),baselineExitsPastWindow:crossed,extended30UsesBaselineEntries:true,notValidatedPnl:true}));
}
for(const w of [...windows.map(w=>w.name),"ALL_RTH"])for(const h of [10,30] as const)report(w,h);
for(const w of windows){
 const subset=trades.filter(t=>t.window===w.name&&t.extended!==null);
 const deltas=subset.map(t=>t.extended!.net-t.baseline.net);
 console.log("WINDOW_PAIRED_DELTA",JSON.stringify({window:w.name,pairedTrades:subset.length,better30:deltas.filter(x=>x>0).length,worse30:deltas.filter(x=>x<0).length,unchanged:deltas.filter(x=>x===0).length,netDelta30Minus10:round(deltas.reduce((s,x)=>s+x,0))}));
}
console.log("WINDOW_COMPLETE",JSON.stringify({eligible,excluded,candidates,collapsedSameCandle:collapsed,skippedOverlap,skippedLate,baselineTrades:trades.length,missing30,baselineParityFailures:parity,fullRthComparison:true,entryTimeET:true,notFreshOutOfSample:true,noLiveApproval:true}));

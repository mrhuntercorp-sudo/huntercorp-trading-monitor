/** E023: offline, descriptive sweeps of prior RTH, Asia, and London levels. */
import {CachedHistoricalDays} from "../research/historical-cache.js";
import {auditRthCoverage} from "../research/rth-coverage.js";
import {rthBars} from "../research/level-reclaim.js";
import {firstWickRejection} from "../research/wick-rejection.js";
import {newYorkClock} from "../market/time.js";
import {provisionalClosedDates,provisionalNqContract,isProvisionalRoll} from "./massive-nq-calendar-policy.js";
import type {MinuteBar} from "../market/types.js";
import type {KnownLevel} from "../research/level-reclaim.js";
const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("NETWORK_DISABLED");}});
const ms=(s:string)=>Date.parse(s+"T00:00:00Z"),iso=(t:number)=>new Date(t).toISOString().slice(0,10);
const end=process.argv[2]??"2026-10-02";
if(!/^\d{4}-\d{2}-\d{2}$/.test(end)||!Number.isFinite(ms(end))||iso(ms(end))!==end)throw Error("INVALID_END_DATE");
const dates:string[]=[];
for(let t=ms(end);dates.length<30;t-=86400000){const d=iso(t),w=new Date(t).getUTCDay();if(w!==0&&w!==6&&!provisionalClosedDates.has(d))dates.push(d);}
dates.reverse();
const loaded=new Map<string,MinuteBar[]>();
async function load(ticker:string,date:string){const k=ticker+"|"+date;if(!loaded.has(k))loaded.set(k,await cache.getDay({ticker,productCode:"NQ"},date));return loaded.get(k)!;}
const clock=(b:MinuteBar)=>{const c=newYorkClock(b.timestampMs);return {date:c.date,minute:c.hour*60+c.minute};};
const prevTradingDate=(d:string)=>{let t=ms(d)-86400000;for(let i=0;i<8;i++,t-=86400000){const s=iso(t),w=new Date(t).getUTCDay();if(w!==0&&w!==6&&!provisionalClosedDates.has(s))return s;}throw Error("NO_PRIOR_SESSION");};
type Obs={date:string;kind:string;side:"HIGH"|"LOW";direction:"LONG"|"SHORT";net10:number;favorable:number;adverse:number;entryMinute:number};
const observations:Obs[]=[],excluded:{date:string;reason:string}[]=[];
let eligible=0;
const levels=["PRIOR_RTH_HIGH","PRIOR_RTH_LOW","ASIA_HIGH","ASIA_LOW","LONDON_HIGH","LONDON_LOW"] as const;
for(const date of dates){
 const ticker=provisionalNqContract(date),previous=prevTradingDate(date);
 if(isProvisionalRoll(date)||isProvisionalRoll(previous)||provisionalNqContract(previous)!==ticker){
  excluded.push({date,reason:"PROVISIONAL_ROLL_OR_CONTRACT_CHANGE"});continue;
 }
 try{
  // Previous RTH can be multiple calendar days earlier; current Asia/London use trade-date UTC data.
  const utcDates=new Set([previous,iso(ms(previous)-86400000),date,iso(ms(date)-86400000)]);
  const all:MinuteBar[]=[];
  for(const d of [...utcDates].sort())all.push(...await load(ticker,d));
  all.sort((a,b)=>a.timestampMs-b.timestampMs);
  if(new Set(all.map(b=>b.timestampMs)).size!==all.length)throw Error("DUPLICATE_BARS");
  const prior=rthBars(all,previous),day=rthBars(all,date);
  if(auditRthCoverage(prior,previous,ticker).status!=="COMPLETE"||auditRthCoverage(day,date,ticker).status!=="COMPLETE")throw Error("INCOMPLETE_RTH");
  // Explicit ET windows; no claim of canonical exchange-defined Asia/London sessions.
  // Asia: 18:00 previous calendar day through 01:59 trade date; London: 02:00-08:59 trade date.
  const prevCalendar=iso(ms(date)-86400000);
  const asia=all.filter(b=>{const c=clock(b);return(c.date===prevCalendar&&c.minute>=1080)||(c.date===date&&c.minute<120);});
  const london=all.filter(b=>{const c=clock(b);return c.date===date&&c.minute>=120&&c.minute<540;});
  const complete=(a:MinuteBar[],n:number)=>a.length===n&&a.every((b,i)=>i===0||b.timestampMs-a[i-1]!.timestampMs===60000);
  if(!complete(asia,480)||!complete(london,420))throw Error("INCOMPLETE_ASIA_LONDON");
  const bounds=(a:MinuteBar[])=>({high:Math.max(...a.map(b=>b.high)),low:Math.min(...a.map(b=>b.low))});
  const p=bounds(prior),a=bounds(asia),l=bounds(london);
  const definitions:KnownLevel[]=[
   {kind:"OVERNIGHT_HIGH",price:p.high,side:"HIGH",knownAtIndex:0},
   {kind:"OVERNIGHT_LOW",price:p.low,side:"LOW",knownAtIndex:0},
   {kind:"OVERNIGHT_HIGH",price:a.high,side:"HIGH",knownAtIndex:0},
   {kind:"OVERNIGHT_LOW",price:a.low,side:"LOW",knownAtIndex:0},
   {kind:"OVERNIGHT_HIGH",price:l.high,side:"HIGH",knownAtIndex:0},
   {kind:"OVERNIGHT_LOW",price:l.low,side:"LOW",knownAtIndex:0}
  ];
  eligible++;
  for(let k=0;k<definitions.length;k++){
   const level=definitions[k]!,event=firstWickRejection(day,level);
   if(!event||event.barIndex+11>day.length)continue;
   const next=day[event.barIndex+1]!,entry=next.open,sign=event.direction==="LONG"?1:-1;
   const future=day.slice(event.barIndex+1,event.barIndex+11);
   observations.push({date,kind:levels[k]!,side:level.side,direction:event.direction,
    net10:sign*(future.at(-1)!.close-entry),
    favorable:Math.max(0,...future.map(b=>sign===1?b.high-entry:entry-b.low)),
    adverse:Math.max(0,...future.map(b=>sign===1?entry-b.low:b.high-entry)),
    entryMinute:clock(next).minute});
  }
 }catch(e){const msg=e instanceof Error?e.message:String(e);excluded.push({date,reason:msg.includes("ENOENT")?"MISSING_CACHE":msg});}
}
const round=(n:number)=>Math.round(n*100)/100;
const summary=(a:Obs[])=>({events:a.length,sessions:new Set(a.map(x=>x.date)).size,
 positive:a.filter(x=>x.net10>0).length,negative:a.filter(x=>x.net10<0).length,
 avgTenBarClosePoints:a.length?round(a.reduce((s,x)=>s+x.net10,0)/a.length):null,
 avgFavorable:a.length?round(a.reduce((s,x)=>s+x.favorable,0)/a.length):null,
 avgAdverse:a.length?round(a.reduce((s,x)=>s+x.adverse,0)/a.length):null});
console.log("=== TM001 E023 PRIOR DAY / ASIA / LONDON SWEEP AUDIT ===");
console.log("HISTORICAL_IN_SAMPLE | CACHE_ONLY | ZERO_API | ZERO_ORDERS | DESCRIPTIVE_ONLY");
console.log("DEFINITIONS",JSON.stringify({prior:"PREVIOUS_COMPLETE_RTH_0930_TO_1559_ET",asia:"1800_PREVIOUS_CALENDAR_DAY_TO_0159_ET",london:"0200_TO_0859_ET",
 signal:"FIRST_WICK_STRICTLY_BEYOND_LEVEL_AND_CLOSE_INSIDE",entryReference:"NEXT_BAR_OPEN",horizon:10,
 windowsProvisional:true,overlappingSignalsPossible:true,notATradeSimulation:true,notIndependent:true}));
console.log("COVERAGE",JSON.stringify({requested:dates.length,eligible,excluded}));
for(const kind of levels){const a=observations.filter(x=>x.kind===kind);console.log("LEVEL_RESULT",JSON.stringify({kind,...summary(a),before11:summary(a.filter(x=>x.entryMinute<660))}));}
console.log("SIDE_RESULT",JSON.stringify({high:summary(observations.filter(x=>x.side==="HIGH")),low:summary(observations.filter(x=>x.side==="LOW"))}));
console.log("E023_COMPLETE",JSON.stringify({events:observations.length,noApi:true,noOrders:true,noEdgeClaim:true}));

/** Confirmation-time forward diagnostic; no fills, no orders, no API. */
import {CachedHistoricalDays} from "../research/historical-cache.js";
import {auditRthCoverage} from "../research/rth-coverage.js";
import {overnightBars} from "../research/session-features.js";
import {knownLevels,firstReclaim,rthBars} from "../research/level-reclaim.js";
import {reclaimHold} from "../research/reclaim-confirmation.js";
import {provisionalClosedDates,provisionalNqContract,isProvisionalRoll} from "./massive-nq-calendar-policy.js";
const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("NETWORK_DISABLED");}});
const ms=(s:string)=>Date.parse(s+"T00:00:00Z"),iso=(t:number)=>new Date(t).toISOString().slice(0,10);
const dates:string[]=[];for(let t=ms("2026-10-02");dates.length<30;t-=86400000){const d=iso(t),w=new Date(t).getUTCDay();if(w!==0&&w!==6&&!provisionalClosedDates.has(d))dates.push(d);}dates.reverse();
const loaded=new Map<string,Awaited<ReturnType<typeof cache.getDay>>>();
async function load(ticker:string,date:string){const k=ticker+"|"+date;if(!loaded.has(k))loaded.set(k,await cache.getDay({ticker,productCode:"NQ"},date));return loaded.get(k)!;}
type Row={date:string;status:string;move:number|null;hasEntryBar:boolean;entryToTenClose:number|null;firstOpen:number|null};
const rows:Row[]=[];let eligible=0,excluded=0;
const median=(xs:number[])=>{if(!xs.length)return null;const a=[...xs].sort((x,y)=>x-y);return Math.round((a[Math.floor((a.length-1)/2)]!+a[Math.floor(a.length/2)]!)*50)/100;};
console.log("=== TM001 POST-CONFIRMATION CAUSAL DIAGNOSTIC ===");
console.log("IN_SAMPLE | CACHE_ONLY | ZERO_API | ZERO_TRADES | NO_PNL | NO_OPTIMIZATION");
for(const date of dates){
 const ticker=provisionalNqContract(date),prior=iso(ms(date)-86400000);
 const bars=[...await load(ticker,prior),...await load(ticker,date)].sort((a,b)=>a.timestampMs-b.timestampMs);
 const day=rthBars(bars,date),overnight=overnightBars(bars,date);
 if(isProvisionalRoll(date)||auditRthCoverage(day,date,ticker).status!=="COMPLETE"||overnight.length!==930||overnight.some((b,i)=>i>0&&b.timestampMs-overnight[i-1]!.timestampMs!==60000)||new Set(bars.map(b=>b.timestampMs)).size!==bars.length){excluded++;continue;}
 eligible++;const seen=new Set<string>();
 for(const level of knownLevels(day,overnight)){
  const e=firstReclaim(day,level);if(!e)continue;
  const key=[e.reclaimTimestampMs,e.price,e.direction].join("|");if(seen.has(key))continue;seen.add(key);
  const hold=reclaimHold(day,e,2),confirmationIndex=e.reclaimIndex+2;
  if(hold.status!=="HELD"){rows.push({date,status:hold.status,move:null,hasEntryBar:false,entryToTenClose:null,firstOpen:null});continue;}
  const confirmed=day[confirmationIndex],entry=day[confirmationIndex+1],ten=day[confirmationIndex+10];
  const sign=e.direction==="LONG"?1:-1;
  rows.push({date,status:"HELD",move:confirmed&&ten?sign*(ten.close-confirmed.close):null,hasEntryBar:!!entry,entryToTenClose:entry&&ten?sign*(ten.close-entry.open):null,firstOpen:entry?.open??null});
 }
}
for(const status of ["ALL","HELD","FAILED","PENDING"]){
 const items=rows.filter(r=>status==="ALL"||r.status===status),full=items.filter(r=>r.entryToTenClose!==null);
 console.log("POST_CONFIRMATION_GROUP",JSON.stringify({group:status,events:items.length,entryBars:items.filter(r=>r.hasEntryBar).length,completeTenMinutePostConfirmation:full.length,positive:full.filter(r=>r.entryToTenClose!>0).length,negative:full.filter(r=>r.entryToTenClose!<0).length,flat:full.filter(r=>r.entryToTenClose===0).length,medianNextOpenToTenClosePoints:median(full.map(r=>r.entryToTenClose!)),medianConfirmationCloseToTenClosePoints:median(items.filter(r=>r.move!==null).map(r=>r.move!)),noFeesOrStops:true}));
}
console.log("POST_CONFIRMATION_COMPLETE",JSON.stringify({eligible,excluded,events:rows.length,entryEarliestNextBarOpen:true,requiresTenCompleteBarsAfterConfirmation:true,notTradePnl:true,correlatedObservations:true,noLiveApproval:true}));

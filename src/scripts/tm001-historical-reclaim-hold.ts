/** Historical diagnostic only: hold labels use future bars, not entry-time information. */
import {CachedHistoricalDays} from "../research/historical-cache.js";
import {auditRthCoverage} from "../research/rth-coverage.js";
import {overnightBars} from "../research/session-features.js";
import {knownLevels,firstReclaim,forwardExcursion,rthBars} from "../research/level-reclaim.js";
import {reclaimHold,opposingLevelRoom} from "../research/reclaim-confirmation.js";
import {provisionalClosedDates,provisionalNqContract,isProvisionalRoll} from "./massive-nq-calendar-policy.js";
const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("NETWORK_DISABLED");}});
const ms=(s:string)=>Date.parse(s+"T00:00:00Z"),iso=(t:number)=>new Date(t).toISOString().slice(0,10);
const dates:string[]=[];for(let t=ms("2026-10-02");dates.length<30;t-=86400000){const d=iso(t),w=new Date(t).getUTCDay();if(w!==0&&w!==6&&!provisionalClosedDates.has(d))dates.push(d);}dates.reverse();
const loaded=new Map<string,Awaited<ReturnType<typeof cache.getDay>>>();
async function load(ticker:string,date:string){const k=ticker+"|"+date;if(!loaded.has(k))loaded.set(k,await cache.getDay({ticker,productCode:"NQ"},date));return loaded.get(k)!;}
type Row={status:string;move:number|null;room:number|null;date:string};
const rows:Row[]=[];let eligible=0,excluded=0;
const median=(xs:number[])=>{if(!xs.length)return null;const a=[...xs].sort((x,y)=>x-y);return Math.round((a[Math.floor((a.length-1)/2)]!+a[Math.floor(a.length/2)]!)*50)/100;};
console.log("=== TM001 HISTORICAL RECLAIM HOLD DIAGNOSTIC ===");
console.log("IN_SAMPLE | ZERO_API | ZERO_TRADES | NO_PNL | FUTURE_CLASSIFICATION_NOT_ENTRY_SIGNAL");
for(const date of dates){
 const ticker=provisionalNqContract(date),prior=iso(ms(date)-86400000);
 const bars=[...await load(ticker,prior),...await load(ticker,date)].sort((a,b)=>a.timestampMs-b.timestampMs);
 const day=rthBars(bars,date),overnight=overnightBars(bars,date);
 if(isProvisionalRoll(date)||auditRthCoverage(day,date,ticker).status!=="COMPLETE"||overnight.length!==930||overnight.some((b,i)=>i>0&&b.timestampMs-overnight[i-1]!.timestampMs!==60000)||new Set(bars.map(b=>b.timestampMs)).size!==bars.length){excluded++;continue;}
 eligible++;
 const seen=new Set<string>(),levels=knownLevels(day,overnight);
 for(const level of levels){
  const e=firstReclaim(day,level);if(!e)continue;
  const key=[e.reclaimTimestampMs,e.price,e.direction].join("|");if(seen.has(key))continue;seen.add(key);
  const hold=reclaimHold(day,e,2),forward=forwardExcursion(day,e,10),room=opposingLevelRoom(e,levels);
  rows.push({date,status:hold.status,move:forward.closeMovePoints,room:room.roomPoints});
 }
}
for(const status of ["ALL","HELD","FAILED","PENDING"]){
 const items=rows.filter(r=>status==="ALL"||r.status===status),full=items.filter(r=>r.move!==null);
 console.log("HOLD_GROUP",JSON.stringify({group:status,events:items.length,fullForward:full.length,positive:full.filter(r=>r.move!>0).length,negative:full.filter(r=>r.move!<0).length,flat:full.filter(r=>r.move===0).length,medianTenMinuteCloseMovePoints:median(full.map(r=>r.move!)),medianKnownOpposingRoomPoints:median(items.filter(r=>r.room!==null).map(r=>r.room!)),unknownOpposingRoom:items.filter(r=>r.room===null).length,notAWinRate:true}));
}
console.log("HOLD_DIAGNOSTICS_COMPLETE",JSON.stringify({eligible,excluded,events:rows.length,holdStatusUsesTwoFutureBars:true,forwardOutcomeMeasuredFromReclaimNotConfirmation:true,notTradablePnl:true,independentEvents:false,noLiveApproval:true}));

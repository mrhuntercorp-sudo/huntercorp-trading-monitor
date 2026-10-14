/** E005: frozen-rule execution inspection. Importing E003 enforces historical reconciliation. */
import {e003Rows} from "./tm001-e003-trade-ledger.js";
import {CachedHistoricalDays} from "../research/historical-cache.js";
import {rthBars} from "../research/level-reclaim.js";
import {provisionalNqContract} from "./massive-nq-calendar-policy.js";
import {newYorkClock} from "../market/time.js";
const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("NETWORK_DISABLED");}});
const ms=(s:string)=>Date.parse(s+"T00:00:00Z");
const iso=(n:number)=>new Date(n).toISOString();
const clock=(n:number)=>{const c=newYorkClock(n);return c.date+" "+String(c.hour).padStart(2,"0")+":"+String(c.minute).padStart(2,"0")+" ET";};
const rows=e003Rows.filter(r=>r.status==="TRADE"&&r.entryTimeUtc===r.exitTimeUtc);
console.log("E005_CONTRACT",JSON.stringify({sameMinuteTrades:rows.length,expected:6,
 noOptimization:true,cacheOnly:true,noOrders:true,executionModel:"MINUTE_OHLC_SIMULATION"}));
if(rows.length!==6||rows.filter(x=>x.strategy==="P4").length!==5||rows.filter(x=>x.strategy==="ORB5").length!==1)
 throw Error("E005_ENTRY_MINUTE_COUNT_MISMATCH_STOP");
let p4=0,orb=0;
for(const row of rows){
 const ticker=provisionalNqContract(row.date);
 const prior=new Date(ms(row.date)-86400000).toISOString().slice(0,10);
 const bars=[...await cache.getDay({ticker,productCode:"NQ"},prior),
  ...await cache.getDay({ticker,productCode:"NQ"},row.date)].sort((a,b)=>a.timestampMs-b.timestampMs);
 const day=rthBars(bars,row.date);
 const index=day.findIndex(b=>b.timestampMs===Date.parse(row.entryTimeUtc!));
 if(index<1)throw Error("E005_ENTRY_MISSING "+row.date);
 const entry=day[index]!,previous=day[index-1]!;
 if(Math.abs(entry.open-row.entry!)>1e-7)throw Error("E005_ENTRY_OPEN_MISMATCH "+row.date);
 const sign=row.direction==="LONG"?1:-1;
 const stopHit=sign===1?entry.low<=row.stop!:entry.high>=row.stop!;
 const targetHit=sign===1?entry.high>=row.target!:entry.low<=row.target!;
 if(!stopHit&&!targetHit)throw Error("E005_EXIT_TOUCH_MISMATCH "+row.date);
 if(row.exitReason!==(stopHit?"STOP":"TARGET"))throw Error("E005_EXIT_REASON_MISMATCH "+row.date);
 const entryGapPoints=(entry.open-previous.close)*sign;
 const gapStop=sign===1?entry.open<row.stop!:entry.open>row.stop!;
 console.log("E005_ENTRY_MINUTE",JSON.stringify({date:row.date,strategy:row.strategy,direction:row.direction,
 signalBarEt:clock(previous.timestampMs),signalBar:{open:previous.open,high:previous.high,low:previous.low,close:previous.close},
 entryBarEt:clock(entry.timestampMs),entryBar:{open:entry.open,high:entry.high,low:entry.low,close:entry.close},
 assumedEntry:row.entry,stop:row.stop,target:row.target,exit:row.exit,exitReason:row.exitReason,
 entryGapDirectionalPoints:entryGapPoints,stopTouched:stopHit,targetTouched:targetHit,
 stopAndTargetBothTouched:stopHit&&targetHit,entryOpenBeyondStop:gapStop,
 caveat:"OHLC cannot establish fill quality or the within-minute price path"}));
 if(row.strategy==="P4")p4++;else orb++;
}
console.log("E005_EXECUTION_SUMMARY",JSON.stringify({status:"GREEN",p4EntryMinuteExits:p4,orbEntryMinuteExits:orb,
 next:"Recover original OOS test provenance; do not promote strategy",noStrategyApproved:true}));

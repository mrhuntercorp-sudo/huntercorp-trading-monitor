/** TM001 exploratory London-high breakout audit. Cache-only, no API, no orders.
 * Descriptive event study, not a strategy or trade simulator.
 */
import {readdir,readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {join} from "node:path";
import {newYorkClock} from "../market/time.js";
import type {MinuteBar} from "../market/types.js";

const folder="data/cache/massive/NQ/NQZ6";
const clock=(b:MinuteBar)=>{const t=newYorkClock(b.timestampMs);return {date:t.date,m:t.hour*60+t.minute};};
const complete=(bars:MinuteBar[],start:number,count:number)=>{
 const minutes=new Set(bars.map(b=>clock(b).m));
 return Array.from({length:count},(_,i)=>start+i).every(m=>minutes.has(m));
};
type RecordData={schema:number;provider:string;ticker:string;productCode:string;utcDate:string;sha256:string;bars:MinuteBar[]};
const records=new Map<string,MinuteBar[]>();
const files=(await readdir(folder)).filter(f=>/^\d{4}-\d{2}-\d{2}(\.research)?\.json$/.test(f)).sort();
for(const file of files){
 const record=JSON.parse(await readFile(join(folder,file),"utf8")) as RecordData;
 if(!Array.isArray(record.bars))throw Error("INVALID_BARS "+file);
 const sha=createHash("sha256").update(JSON.stringify(record.bars)).digest("hex");
 if(record.schema!==1||record.provider!=="massive"||record.ticker!=="NQZ6"||
 record.productCode!=="NQ"||record.sha256!==sha||
 !file.startsWith(record.utcDate+"."))throw Error("CACHE_VALIDATION_FAILED "+file);
 if(record.bars.some((b,i)=>b.contractTicker!=="NQZ6"||b.productCode!=="NQ"||
 !Number.isSafeInteger(b.timestampMs)||b.timestampMs%60000!==0||
 (i>0&&b.timestampMs<=record.bars[i-1]!.timestampMs)))throw Error("INVALID_BAR_ORDER "+file);
 const previous=records.get(record.utcDate);
 if(!previous||record.bars.length>previous.length)records.set(record.utcDate,record.bars);
}
/** Diagnostic only: inspect failed London-high sweep shorts; no orders or APIs. */
const lossDates=new Set(["2026-09-16","2026-09-29","2026-10-02","2026-10-06"]);
const stops=[12.5,15,20,25] as const;
console.log("=== LONDON HIGH SWEEP LOSS DIAGNOSTIC ===");
console.log("DIAGNOSTIC_RULES",JSON.stringify({targetPoints:20,stopCandidates:stops,
 note:"Counterfactual stops are exploratory, NOT an optimized trading recommendation",
 firstHighSweepPerDay:true,nextBarOpen:true,maxBars:30,stopFirstOnAmbiguousBars:true,
 inSample:true,requests:0,orders:0}));
for(const [date,bars] of [...records].sort(([a],[b])=>a.localeCompare(b))){
 if(!lossDates.has(date))continue;
 const london=bars.filter(b=>{const c=clock(b);return c.date===date&&c.m>=120&&c.m<540;});
 const opening=bars.filter(b=>{const c=clock(b);return c.date===date&&c.m>=570&&c.m<660;});
 if(!complete(london,120,420)||!complete(opening,570,90)){console.log("QUARANTINED",date);continue;}
 const hi=Math.max(...london.map(b=>b.high));
 const signal=opening.find(b=>b.high>hi&&b.close<hi);
 if(!signal){console.log("NO_SIGNAL",date);continue;}
 const start=signal.timestampMs+60000;
 const path=bars.filter(b=>b.timestampMs>=start&&b.timestampMs<start+30*60000);
 if(path.length!==30||path.some((b,i)=>b.timestampMs!==start+i*60000)){console.log("MISSING_PATH",date);continue;}
 const entry=path[0]!.open,target=entry-20;
 const maxAdverse=Math.max(...path.map(b=>b.high-entry));
 const maxFavorable=Math.max(...path.map(b=>entry-b.low));
 const cases=stops.map(stopPoints=>{
  const stop=entry+stopPoints;
  let reason="TIME",exit=path[29]!.close,held=30,ambiguous=false;
  for(let i=0;i<path.length;i++){
   const b=path[i]!;
   if(i>0&&b.open>=stop){reason="STOP_GAP";exit=b.open;held=i+1;break;}
   if(i>0&&b.open<=target){reason="TARGET";exit=target;held=i+1;break;}
   const stopHit=b.high>=stop,targetHit=b.low<=target;
   if(stopHit){reason="STOP";exit=stop;held=i+1;ambiguous=targetHit;break;}
   if(targetHit){reason="TARGET";exit=target;held=i+1;break;}
  }
  return {stopPoints,riskDollars:stopPoints*20,reason,heldBars:held,
   grossDollars:Number(((entry-exit)*20).toFixed(2)),ambiguous};
 });
 console.log("LOSS_DAY",JSON.stringify({date,londonHigh:hi,signalTimeMs:signal.timestampMs,
 signalHigh:signal.high,signalClose:signal.close,entry,
 entryDistanceBelowLondonHigh:Number((hi-entry).toFixed(2)),
 full30MinMaxAdversePoints:Number(maxAdverse.toFixed(2)),
 full30MinMaxFavorablePoints:Number(maxFavorable.toFixed(2)),
 cases}));
}

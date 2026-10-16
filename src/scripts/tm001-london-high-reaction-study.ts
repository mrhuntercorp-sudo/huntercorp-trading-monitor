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
/** TM001 observational study of London-high sweep entries, no optimization. */
console.log("=== TM001 LONDON HIGH SWEEP REACTION STUDY ===");
console.log("STUDY_RULES",JSON.stringify({londonEt:"02:00-08:59",signalEt:"09:30-10:59",
 signal:"HIGH_ABOVE_LONDON_HIGH_AND_CLOSE_BELOW",entry:"NEXT_BAR_OPEN",
 stopPoints:12.5,targetPoints:20,holdBars:30,stopFirst:true,
 preSignalBars:5,postSignalBars:5,requests:0,orders:0,
 warning:"IN_SAMPLE_1M_BARS_NO_INTRABAR_SEQUENCE_NOT_AN_ENTRY_RULE"}));
let eligible=0,excluded=0,signals=0,wins=0,losses=0;
for(const [date,bars] of [...records].sort(([a],[b])=>a.localeCompare(b))){
 const london=bars.filter(b=>{const c=clock(b);return c.date===date&&c.m>=120&&c.m<540;});
 const opening=bars.filter(b=>{const c=clock(b);return c.date===date&&c.m>=570&&c.m<660;});
 if(!complete(london,120,420)||!complete(opening,570,90)){excluded++;continue;}
 eligible++;
 const hi=Math.max(...london.map(b=>b.high));
 const sig=opening.find(b=>b.high>hi&&b.close<hi);
 if(!sig)continue;
 const idx=bars.findIndex(b=>b.timestampMs===sig.timestampMs);
 if(idx<5){console.log("SKIP_INCOMPLETE_PRE",date);continue;}
 const entryBar=bars[idx+1];
 if(!entryBar||entryBar.timestampMs!==sig.timestampMs+60000){console.log("SKIP_MISSING_ENTRY",date);continue;}
 const path=bars.slice(idx+1,idx+31);
 if(path.length!==30||path.some((b,i)=>b.timestampMs!==sig.timestampMs+(i+1)*60000)){
  console.log("SKIP_MISSING_EXIT",date);continue;
 }
 const entry=entryBar.open,stop=entry+12.5,target=entry-20;
 let outcome="TIME",exit=path[29]!.close,held=30,ambiguous=false;
 for(let i=0;i<path.length;i++){
  const b=path[i]!;
  if(i>0&&b.open>=stop){outcome="STOP_GAP";exit=b.open;held=i+1;break;}
  if(i>0&&b.open<=target){outcome="TARGET";exit=target;held=i+1;break;}
  const sh=b.high>=stop,th=b.low<=target;
  if(sh){outcome="STOP";exit=stop;held=i+1;ambiguous=th;break;}
  if(th){outcome="TARGET";exit=target;held=i+1;break;}
 }
 signals++;if(outcome==="TARGET")wins++;else if(outcome.startsWith("STOP"))losses++;
 const candles=bars.slice(idx-5,idx+7).filter((b,i,a)=>i===0||b.timestampMs===a[i-1]!.timestampMs+60000);
 const snap=(b:MinuteBar)=>({et:newYorkClock(b.timestampMs).hour.toString().padStart(2,"0")+":"+newYorkClock(b.timestampMs).minute.toString().padStart(2,"0"),
  o:b.open,h:b.high,l:b.low,c:b.close,
  aboveHigh:b.high>hi,closedBelow:b.close<hi,
  range:Number((b.high-b.low).toFixed(2)),body:Number(Math.abs(b.close-b.open).toFixed(2))});
 const pre=bars.slice(idx-5,idx).map(snap),post=bars.slice(idx+1,idx+6).map(snap);
 const previous=bars[idx-1]!;
 console.log("SWEEP_CASE",JSON.stringify({date,londonHigh:hi,
  signal:snap(sig),previous:snap(previous),
  sweepAbovePoints:Number((sig.high-hi).toFixed(2)),
  signalCloseBelowPoints:Number((hi-sig.close).toFixed(2)),
  entry,entryBelowHighPoints:Number((hi-entry).toFixed(2)),
  priorFive:pre,followingFive:post,
  firstPostCloseBelowHigh:post[0]?.closedBelow??null,
  firstPostCloseBelowEntry:post[0]?post[0].c<entry:null,
  result:outcome,exit,heldBars:held,ambiguous,
  grossDollars:Number(((entry-exit)*20).toFixed(2))}));
}
console.log("STUDY_SUMMARY",JSON.stringify({eligibleDays:eligible,excludedContextDays:excluded,
 signals,wins,losses,requests:0,orders:0,
 note:"OBSERVATIONAL_ONLY_NO_FILTER_SELECTED_NO_STRATEGY_CHANGES"}));

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
/** Four independent candidate setups, identical execution and risk assumptions.
 * Exploratory in-sample comparison. Signals are NOT mutually exclusive.
 */
type Setup="HIGH_BREAK_LONG"|"HIGH_SWEEP_SHORT"|"LOW_BREAK_SHORT"|"LOW_SWEEP_LONG";
type Side="LONG"|"SHORT";
type Result={date:string;setup:Setup;net:number;reason:"STOP"|"TARGET"|"TIME";ambiguous:boolean};
const rules={stop:40,target:80,maxBars:30,cost:2} as const;
const setups:Setup[]=["HIGH_BREAK_LONG","HIGH_SWEEP_SHORT","LOW_BREAK_SHORT","LOW_SWEEP_LONG"];
const results:Result[]=[];
const stats=new Map<Setup,{signals:number;missing:number;noSignal:number}>(setups.map(s=>[s,{signals:0,missing:0,noSignal:0}]));
let eligible=0,quarantined=0;
const matches=(setup:Setup,b:MinuteBar,hi:number,lo:number)=>{
 switch(setup){
 case "HIGH_BREAK_LONG":return b.high>hi&&b.close>hi;
 case "HIGH_SWEEP_SHORT":return b.high>hi&&b.close<hi;
 case "LOW_BREAK_SHORT":return b.low<lo&&b.close<lo;
 case "LOW_SWEEP_LONG":return b.low<lo&&b.close>lo;
 }
};
const side=(setup:Setup):Side=>setup.endsWith("LONG")?"LONG":"SHORT";
const clockEt=(b:MinuteBar)=>{const m=clock(b).m;return String(Math.floor(m/60)).padStart(2,"0")+":"+String(m%60).padStart(2,"0");};
console.log("=== TM001 LONDON FOUR-WAY FIXED COMPARISON ===");
console.log("COMPARE_RULES",JSON.stringify({london:"02:00-08:59_ET",signal:"09:30-10:59_ET",
 firstSignalPerSetupPerDay:true,highBreak:"high>londonHigh AND close>londonHigh",
 highSweep:"high>londonHigh AND close<londonHigh",
 lowBreak:"low<londonLow AND close<londonLow",
 lowSweep:"low<londonLow AND close>londonLow",
 entry:"NEXT_1M_OPEN",stopPoints:40,targetPoints:80,maxBars:30,
 costPoints:2,stopPriority:true,gapStopAtOpen:true,independentSetups:true,
 inSample:true,apiRequests:0,orders:0}));
for(const [date,bars] of [...records].sort(([a],[b])=>a.localeCompare(b))){
 const london=bars.filter(b=>{const c=clock(b);return c.date===date&&c.m>=120&&c.m<540;});
 const opening=bars.filter(b=>{const c=clock(b);return c.date===date&&c.m>=570&&c.m<660;});
 if(!complete(london,120,420)||!complete(opening,570,90)){
  quarantined++;console.log("DAY",JSON.stringify({date,status:"QUARANTINED_CONTEXT",
   londonBars:london.length,openingBars:opening.length}));continue;
 }
 eligible++;
 const hi=Math.max(...london.map(b=>b.high)),lo=Math.min(...london.map(b=>b.low));
 for(const setup of setups){
  const st=stats.get(setup)!;
  const signal=opening.find(b=>matches(setup,b,hi,lo));
  if(!signal){st.noSignal++;continue;}
  st.signals++;
  const entryTime=signal.timestampMs+60000;
  const path=bars.filter(b=>b.timestampMs>=entryTime&&b.timestampMs<entryTime+rules.maxBars*60000);
  if(path.length!==rules.maxBars||path.some((b,i)=>b.timestampMs!==entryTime+i*60000)){
   st.missing++;console.log("TRADE",JSON.stringify({date,setup,status:"QUARANTINED_EXIT",
    signalEt:clockEt(signal),availableBars:path.length}));continue;
  }
  const direction=side(setup),entry=path[0]!.open;
  const stop=direction==="LONG"?entry-rules.stop:entry+rules.stop;
  const target=direction==="LONG"?entry+rules.target:entry-rules.target;
  let exit=path.at(-1)!.close,reason:"STOP"|"TARGET"|"TIME"="TIME",ambiguous=false,held=rules.maxBars;
  for(let i=0;i<path.length;i++){
   const b=path[i]!;
   if(b.high<b.low||b.high<Math.max(b.open,b.close)||b.low>Math.min(b.open,b.close))throw Error("INVALID_BAR "+date);
   if(i>0&&(direction==="LONG"?b.open<=stop:b.open>=stop)){
    exit=b.open;reason="STOP";held=i+1;break;
   }
   if(i>0&&(direction==="LONG"?b.open>=target:b.open<=target)){
    exit=target;reason="TARGET";held=i+1;break;
   }
   const stopHit=direction==="LONG"?b.low<=stop:b.high>=stop;
   const targetHit=direction==="LONG"?b.high>=target:b.low<=target;
   if(stopHit){exit=stop;reason="STOP";ambiguous=targetHit;held=i+1;break;}
   if(targetHit){exit=target;reason="TARGET";held=i+1;break;}
  }
  const gross=direction==="LONG"?exit-entry:entry-exit;
  const net=Number((gross-rules.cost).toFixed(2));
  results.push({date,setup,net,reason,ambiguous});
  console.log("TRADE",JSON.stringify({date,setup,status:"SIMULATED",londonHigh:hi,londonLow:lo,
   signalEt:clockEt(signal),signalClose:signal.close,entry,stop,target,exit,reason,
   barsHeld:held,grossPoints:Number(gross.toFixed(2)),netPoints:net,ambiguous}));
 }
}
for(const setup of setups){
 const rows=results.filter(r=>r.setup===setup),st=stats.get(setup)!;
 let equity=0,peak=0,maxDd=0;
 for(const r of rows){equity+=r.net;peak=Math.max(peak,equity);maxDd=Math.max(maxDd,peak-equity);}
 const net=Number(equity.toFixed(2));
 console.log("SETUP_SUMMARY",JSON.stringify({setup,eligibleDays:eligible,signals:st.signals,
  simulated:rows.length,noSignalDays:st.noSignal,missingExitDays:st.missing,
  wins:rows.filter(r=>r.net>0).length,losses:rows.filter(r=>r.net<0).length,
  stops:rows.filter(r=>r.reason==="STOP").length,
  targets:rows.filter(r=>r.reason==="TARGET").length,
  timeExits:rows.filter(r=>r.reason==="TIME").length,
  ambiguous:rows.filter(r=>r.ambiguous).length,
  netPoints:net,avgPoints:rows.length?Number((net/rows.length).toFixed(2)):null,
  maxClosedTradeDrawdownPoints:Number(maxDd.toFixed(2))}));
}
console.log("COMPARE_SUMMARY",JSON.stringify({eligibleDays:eligible,quarantinedContextDays:quarantined,
 setups:4,independentSignalsCanOverlap:true,rankingNotValidation:true,
 warning:"IN_SAMPLE_HYPOTHETICAL_SMALL_SAMPLE_NO_LIVE_EXECUTION",
 requests:0,orders:0}));

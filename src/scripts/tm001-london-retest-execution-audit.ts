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
/** No-lookahead London high retest audit: definitions and execution feasibility. */
type Method="IMMEDIATE_SHORT"|"LEGACY_RETEST"|"STRICT_RETEST";
type Trade={date:string;method:Method;signal:string;entry:number;high:number;distance:number;stop:number;gross:number;net:number;outcome:string;ambiguous:boolean;held:number};
const trades:Trade[]=[];
const methods:Method[]=["IMMEDIATE_SHORT","LEGACY_RETEST","STRICT_RETEST"];
const counts=new Map<Method,{eligible:number;noSignal:number;incomplete:number;unsafe:number}>(methods.map(m=>[m,{eligible:0,noSignal:0,incomplete:0,unsafe:0}]));
const stopPts=12.5,targetPts=20,costPts=2;
console.log("=== TM001 LONDON HIGH RETEST EXECUTION AUDIT ===");
console.log("AUDIT_CONTRACT",JSON.stringify({researchOnly:true,cacheOnly:true,apiCalls:0,orders:0,
 london:"02:00-08:59 ET",signal:"09:30-10:59 ET",stopPts,targetPts,
 estimatedRoundtripCostDollars:40,plannedStopRiskDollars:250,
 riskIncludingCostDollars:290,strictRetest:"After first rejection, prior completed bar must close below London high; current bar opens below high, touches high and closes below; enter next bar open",
 legacyRetest:"After first rejection, within five bars opens below high, touches high and closes below; enter next open",
 caveats:["Only one-minute OHLC, stop-first on same-bar ambiguity","Retest definitions exploratory and selected after observing earlier results","No out-of-sample validation in this run","$250 stop risk excludes fees and slippage"]}));
let eligibleDays=0,excludedDays=0;
for(const [date,bars] of [...records].sort(([a],[b])=>a.localeCompare(b))){
 const london=bars.filter(b=>{const c=clock(b);return c.date===date&&c.m>=120&&c.m<540;});
 const opening=bars.filter(b=>{const c=clock(b);return c.date===date&&c.m>=570&&c.m<660;});
 if(!complete(london,120,420)||!complete(opening,570,90)){excludedDays++;continue;}
 eligibleDays++;
 const high=Math.max(...london.map(b=>b.high));
 const first=opening.find(b=>b.high>high&&b.close<high);
 const index=first?bars.findIndex(b=>b.timestampMs===first.timestampMs):-1;
 for(const method of methods){
  const count=counts.get(method)!;count.eligible++;
  if(index<0){count.noSignal++;continue;}
  let signal:MinuteBar|undefined;
  if(method==="IMMEDIATE_SHORT")signal=first;
  else for(let k=1;k<=5;k++){
   const b=bars[index+k],prev=bars[index+k-1];
   if(!b||!prev||b.timestampMs!==first!.timestampMs+k*60000)break;
   const legacy=b.open<high&&b.high>=high&&b.close<high;
   const strict=legacy&&prev.close<high;
   if(method==="LEGACY_RETEST"?legacy:strict){signal=b;break;}
  }
  if(!signal){count.noSignal++;continue;}
  const i=bars.findIndex(b=>b.timestampMs===signal!.timestampMs);
  const path=bars.slice(i+1,i+31);
  if(path.length!==30||path.some((b,j)=>b.timestampMs!==signal!.timestampMs+(j+1)*60000)){
   count.incomplete++;continue;
  }
  const entry=path[0]!.open,stop=entry+stopPts,target=entry-targetPts;
  // A structural stop above the rejection's high may be impossible within the risk cap.
  const rejectionHigh=first!.high,structuralStopDistance=Math.max(0,rejectionHigh-entry+0.25);
  if(structuralStopDistance>stopPts)count.unsafe++;
  let exit=path[29]!.close,outcome="TIME",held=30,ambiguous=false;
  for(let j=0;j<path.length;j++){
   const b=path[j]!;
   if(j>0&&b.open>=stop){exit=b.open;outcome="STOP_GAP";held=j+1;break;}
   if(j>0&&b.open<=target){exit=target;outcome="TARGET";held=j+1;break;}
   const s=b.high>=stop,t=b.low<=target;
   if(s){exit=stop;outcome="STOP";ambiguous=t;held=j+1;break;}
   if(t){exit=target;outcome="TARGET";held=j+1;break;}
  }
  const gross=Number(((entry-exit)*20).toFixed(2));
  const trade={date,method,signal:newYorkClock(signal.timestampMs).hour.toString().padStart(2,"0")+":"+newYorkClock(signal.timestampMs).minute.toString().padStart(2,"0"),
   entry,high,distance:Number((high-entry).toFixed(2)),stop:structuralStopDistance,
   gross,net:gross-40,outcome,ambiguous,held};
  trades.push(trade);console.log("AUDIT_TRADE",JSON.stringify({...trade,
   structuralStopFitsCap:structuralStopDistance<=stopPts}));
 }
}
for(const method of methods){
 const all=trades.filter(t=>t.method===method),count=counts.get(method)!;
 const report=(name:string,arr:Trade[])=>{
  let equity=0,peak=0,maxDrawdown=0,lossStreak=0,maxLossStreak=0;
  for(const t of arr){equity+=t.net;peak=Math.max(peak,equity);
   maxDrawdown=Math.max(maxDrawdown,peak-equity);
   lossStreak=t.net<0?lossStreak+1:0;maxLossStreak=Math.max(maxLossStreak,lossStreak);}
  console.log("AUDIT_SUMMARY",JSON.stringify({method,subset:name,trades:arr.length,
   wins:arr.filter(t=>t.net>0).length,losses:arr.filter(t=>t.net<0).length,
   estimatedNetDollars:equity,maxClosedTradeDrawdownDollars:maxDrawdown,
   maxConsecutiveLosses:maxLossStreak,ambiguous:arr.filter(t=>t.ambiguous).length}));
 };
 report("ALL",all);
 report("STRUCTURAL_STOP_FITS_250_GROSS",all.filter(t=>t.stop<=stopPts));
 console.log("AUDIT_COUNTS",JSON.stringify({method,...count}));
}
console.log("AUDIT_END",JSON.stringify({eligibleDays,excludedDays,apiCalls:0,orders:0,
 conclusion:"DESCRIPTIVE_IN_SAMPLE_ONLY_NEEDS_FROZEN_RULES_AND_FRESH_DATES"}));

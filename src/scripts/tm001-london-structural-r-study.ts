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
/** Historical research only: structural distances and R-based excursions. */
console.log("=== LONDON HIGH STRUCTURAL R RESEARCH ===");
console.log("RULES",JSON.stringify({data:"CACHED_NQZ6_1M",entry:"NEXT_BAR_OPEN",stop:"MAX_LONDON_HIGH_REJECTION_HIGH_RETEST_HIGH_PLUS_0.25",targets:[1.5,2,3],trailing:"PRIOR_TWO_COMPLETED_CANDLE_HIGHS_AFTER_1R",budgetDollars:250,costAssumption:"$40 NQ or $4 MNQ per contract, plus 1 point slippage",orders:0,apiCalls:0,inSample:true}));
type Mode="IMMEDIATE"|"RETEST";
type Outcome={date:string;mode:Mode;exitType:string;points:number;qty:number;instrument:string;net:number;ambiguous:boolean;result:string};
const rows:Outcome[]=[];
let eligible=0,excluded=0;
for(const [date,bars] of [...records].sort(([a],[b])=>a.localeCompare(b))){
 const london=bars.filter(b=>{const c=clock(b);return c.date===date&&c.m>=120&&c.m<540;});
 const opening=bars.filter(b=>{const c=clock(b);return c.date===date&&c.m>=570&&c.m<660;});
 if(!complete(london,120,420)||!complete(opening,570,90)){excluded++;continue;}
 eligible++;
 const high=Math.max(...london.map(b=>b.high));
 const first=opening.find(b=>b.high>high&&b.close<high);
 if(!first)continue;
 const fi=bars.findIndex(b=>b.timestampMs===first.timestampMs);
 for(const mode of ["IMMEDIATE","RETEST"] as const){
  let signal=first;
  if(mode==="RETEST"){
   let found=false;
   for(let k=1;k<=5;k++){
    const b=bars[fi+k],p=bars[fi+k-1];
    if(!b||!p||b.timestampMs!==first.timestampMs+k*60000)break;
    if(p.close<high&&b.open<high&&b.high>=high&&b.close<high){signal=b;found=true;break;}
   }
   if(!found)continue;
  }
  const si=bars.findIndex(b=>b.timestampMs===signal.timestampMs);
  const future=bars.slice(si+1,si+31);
  if(future.length!==30||future.some((b,i)=>b.timestampMs!==signal.timestampMs+(i+1)*60000))continue;
  const entry=future[0]!.open,stop=Math.max(high,first.high,signal.high)+0.25;
  const riskPts=stop-entry;
  if(riskPts<=0)continue;
  const nqCost=(riskPts+1)*20+40;
  const instrument=nqCost<=250?"NQ":"MNQ";
  const dollars=instrument==="NQ"?20:2,fee=instrument==="NQ"?40:4;
  const qty=instrument==="NQ"?1:Math.floor(250/((riskPts+1)*2+4));
  if(qty<1){console.log("UNAFFORDABLE",JSON.stringify({date,mode,riskPts}));continue;}
  for(const exitType of ["R1.5","R2","R3","TRAIL"]){
   const multiple=exitType==="R1.5"?1.5:exitType==="R2"?2:3;
   const target=entry-riskPts*multiple;
   let activeStop=stop,exit=future[29]!.close,result="TIME",ambiguous=false,armed=false;
   for(let i=0;i<future.length;i++){
    const b=future[i]!;
    if(exitType==="TRAIL"&&armed&&i>=2)activeStop=Math.min(activeStop,Math.max(future[i-1]!.high,future[i-2]!.high)+0.25);
    const hitStop=b.high>=activeStop,hitTarget=exitType!=="TRAIL"&&b.low<=target;
    if(i>0&&b.open>=activeStop){exit=b.open;result="STOP_GAP";break;}
    if(i>0&&exitType!=="TRAIL"&&b.open<=target){exit=target;result="TARGET";break;}
    if(hitStop){exit=activeStop;result="STOP";ambiguous=hitTarget;break;}
    if(hitTarget){exit=target;result="TARGET";break;}
    if(exitType==="TRAIL"&&b.low<=entry-riskPts)armed=true;
   }
   const net=Number((((entry-exit)*dollars-fee-dollars)*qty).toFixed(2));
   const row={date,mode,exitType,points:Number(riskPts.toFixed(2)),qty,instrument,net,ambiguous,result};
   rows.push(row);console.log("R_TRADE",JSON.stringify(row));
  }
 }
}
for(const mode of ["IMMEDIATE","RETEST"] as const)for(const exitType of ["R1.5","R2","R3","TRAIL"]){
 const subset=rows.filter(r=>r.mode===mode&&r.exitType===exitType);
 let total=0,peak=0,drawdown=0;
 for(const row of subset){total+=row.net;peak=Math.max(peak,total);drawdown=Math.max(drawdown,peak-total);}
 console.log("R_SUMMARY",JSON.stringify({mode,exitType,trades:subset.length,net:total,drawdown,wins:subset.filter(r=>r.net>0).length,ambiguous:subset.filter(r=>r.ambiguous).length}));
}
console.log("RESEARCH_END",JSON.stringify({eligible,excluded,apiCalls:0,orders:0,note:"IN_SAMPLE_EXPLORATORY_NOT_VALIDATED_MNQ_PROXY_PRICES"}));

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
/** Frozen 3R structural vs 30/20 trailing, identical entry and $250 all-in modeled budget. */
type ExitMode="STRUCTURAL_3R"|"STRUCTURAL_BE30_TRAIL20";
type Result={date:string;mode:ExitMode;entry:number;stop:number;qty:number;instrument:string;net:number;exitReason:string;armed:boolean;ambiguous:boolean;maxFavorable:number;stopMoves:number;initialModeledLoss:number};
const modes:ExitMode[]=["STRUCTURAL_3R","STRUCTURAL_BE30_TRAIL20"];
const rows:Result[]=[];
let eligible=0,excluded=0,signals=0;
console.log("=== TM001 EQUAL RISK 3R VS 30/20 AUDIT ===");
console.log("AUDIT_RULES",JSON.stringify({researchOnly:true,cacheOnly:true,apiCalls:0,orders:0,entry:"first rejection next bar open",initialStop:"max London high and rejection high + one tick",target:"3 times structural risk",trailing:"arm when completed bar reaches +30 NQ points, then ratchet in 10-point increments with 20-point offset; no lookahead",budget:250,assumedCostNQ:40,assumedCostMNQ:4,assumedRoundtripSlippagePts:1,maxBars:30,stopFirst:true}));
for(const [date,bars] of [...records].sort(([a],[b])=>a.localeCompare(b))){
 const london=bars.filter(b=>{const c=clock(b);return c.date===date&&c.m>=120&&c.m<540;});
 const opening=bars.filter(b=>{const c=clock(b);return c.date===date&&c.m>=570&&c.m<660;});
 if(!complete(london,120,420)||!complete(opening,570,90)){excluded++;continue;}
 eligible++;
 const high=Math.max(...london.map(b=>b.high));
 const rejection=opening.find(b=>b.high>high&&b.close<high);
 if(!rejection)continue;
 signals++;
 const idx=bars.findIndex(b=>b.timestampMs===rejection.timestampMs);
 const future=bars.slice(idx+1,idx+31);
 if(future.length!==30||future.some((b,i)=>b.timestampMs!==rejection.timestampMs+(i+1)*60000))continue;
 const entry=future[0]!.open,initialStop=Math.max(high,rejection.high)+0.25,risk=initialStop-entry;
 if(risk<=0)continue;
 const nq=(risk+1)*20+40<=250,instrument=nq?"NQ":"MNQ",dollar=nq?20:2,fee=nq?40:4;
 const qty=nq?1:Math.floor(250/((risk+1)*2+4));
 if(qty<1)continue;
 for(const mode of modes){
  let stop=initialStop,armed=false,exit=future[29]!.close,exitReason="TIME",ambiguous=false,lowest=entry,stopMoves=0,maxFavorable=0;
  for(let i=0;i<future.length;i++){
   const bar=future[i]!;
   // Only completed earlier bars affect this bar's active stop.
   if(mode==="STRUCTURAL_BE30_TRAIL20"&&armed){
    const favorable=entry-lowest;
    const steps=Math.floor((favorable-30)/10);
    const candidate=entry-10-steps*10;
    if(candidate<stop){stop=candidate;stopMoves++;}
   }
   const target=entry-3*risk;
   if(i>0&&bar.open>=stop){exit=bar.open;exitReason="STOP_GAP";break;}
   if(i>0&&mode==="STRUCTURAL_3R"&&bar.open<=target){exit=bar.open;exitReason="TARGET_GAP";break;}
   const hitStop=bar.high>=stop,hitTarget=mode==="STRUCTURAL_3R"&&bar.low<=target;
   if(hitStop){exit=stop;exitReason="STOP";ambiguous=hitTarget;break;}
   if(hitTarget){exit=target;exitReason="TARGET";break;}
   lowest=Math.min(lowest,bar.low);
   maxFavorable=Math.max(maxFavorable,entry-bar.low);
   if(mode==="STRUCTURAL_BE30_TRAIL20"&&entry-lowest>=30)armed=true;
  }
  const net=Number((((entry-exit)*dollar-dollar-fee)*qty).toFixed(2));
  const row={date,mode,entry,stop:initialStop,qty,instrument,net,exitReason,armed,ambiguous,maxFavorable,stopMoves,initialModeledLoss:Number(((risk+1)*dollar+fee)*qty)};
  rows.push(row);console.log("COMPARISON_TRADE",JSON.stringify(row));
 }
}
for(const mode of modes){
 const group=rows.filter(r=>r.mode===mode);
 let total=0,peak=0,drawdown=0;
 for(const r of group){total+=r.net;peak=Math.max(peak,total);drawdown=Math.max(drawdown,peak-total);}
 console.log("COMPARISON_SUMMARY",JSON.stringify({mode,trades:group.length,wins:group.filter(r=>r.net>0).length,losses:group.filter(r=>r.net<0).length,net:Number(total.toFixed(2)),maxClosedDrawdown:Number(drawdown.toFixed(2)),armed:group.filter(r=>r.armed).length,ambiguous:group.filter(r=>r.ambiguous).length,maxInitialModeledLoss:Math.max(0,...group.map(r=>r.initialModeledLoss)),netWithoutSep28:Number(group.filter(r=>r.date!=="2026-09-28").reduce((s,r)=>s+r.net,0).toFixed(2))}));
}
for(const date of [...new Set(rows.map(r=>r.date))]){
 const a=rows.find(r=>r.date===date&&r.mode===modes[0]);
 const b=rows.find(r=>r.date===date&&r.mode===modes[1]);
 if(a&&b)console.log("COMPARISON_DELTA",JSON.stringify({date,threeR:a.net,trailing:b.net,difference:Number((b.net-a.net).toFixed(2)),threeRExit:a.exitReason,trailingExit:b.exitReason}));
}
console.log("COMPARISON_END",JSON.stringify({eligible,excluded,signals,apiCalls:0,orders:0,caveats:["in-sample rules selected after prior observations","NQ bars proxy for MNQ fills","one-minute OHLC intrabar ordering unknown","fixed modeled costs and slippage; gap losses may exceed budget","not a live execution model"]}));

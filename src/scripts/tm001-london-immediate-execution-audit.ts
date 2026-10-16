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
/** Frozen immediate-entry execution audit; no API or orders. */
console.log("=== TM001 IMMEDIATE STRUCTURAL EXECUTION AUDIT ===");
console.log("AUDIT_RULES",JSON.stringify({entry:"first London-high sweep close below high, next bar open",stop:"max London high and rejection high + 0.25",exits:["3R","TRAIL"],trailing:"arm only after completed 1R bar; use two prior fully completed highs; stop never loosens",maxBars:30,feesNQ:40,feesMNQ:4,slippagePoints:1,riskBudget:250,cacheOnly:true,orders:0,apiCalls:0}));
type AuditRow={date:string;exitType:string;entry:number;stop:number;riskPts:number;instrument:string;qty:number;net:number;result:string;ambiguous:boolean;stopMoves:{minute:number;from:number;to:number}[];maxModeledStopLoss:number};
const results:AuditRow[]=[];
let eligible=0,excluded=0,signals=0,missingFuture=0;
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
 if(future.length!==30||future.some((b,i)=>b.timestampMs!==rejection.timestampMs+(i+1)*60000)){missingFuture++;continue;}
 const entry=future[0]!.open,stop=Math.max(high,rejection.high)+0.25,riskPts=stop-entry;
 if(riskPts<=0)continue;
 const nq=(riskPts+1)*20+40<=250;
 const instrument=nq?"NQ":"MNQ",value=nq?20:2,fee=nq?40:4;
 const qty=nq?1:Math.floor(250/((riskPts+1)*2+4));
 if(qty<1)continue;
 for(const exitType of ["3R","TRAIL"]){
  let activeStop=stop,armed=false,exit=future[29]!.close,result="TIME",ambiguous=false;
  const moves:{minute:number;from:number;to:number}[]=[];
  for(let i=0;i<future.length;i++){
   const bar=future[i]!;
   if(exitType==="TRAIL"&&armed&&i>=2){
    const candidate=Math.max(future[i-1]!.high,future[i-2]!.high)+0.25;
    if(candidate<activeStop){moves.push({minute:i,from:activeStop,to:candidate});activeStop=candidate;}
   }
   const target=entry-3*riskPts;
   if(i>0&&bar.open>=activeStop){exit=bar.open;result="STOP_GAP";break;}
   if(i>0&&exitType==="3R"&&bar.open<=target){exit=bar.open;result="TARGET_GAP";break;}
   const hitStop=bar.high>=activeStop,hitTarget=exitType==="3R"&&bar.low<=target;
   if(hitStop){exit=activeStop;result="STOP";ambiguous=hitTarget;break;}
   if(hitTarget){exit=target;result="TARGET";break;}
   // Only the completed candle can arm trailing for the next candle.
   if(exitType==="TRAIL"&&bar.low<=entry-riskPts)armed=true;
  }
  const net=Number((((entry-exit)*value-value-fee)*qty).toFixed(2));
  const row:AuditRow={date,exitType,entry,stop,riskPts,instrument,qty,net,result,ambiguous,stopMoves:moves,maxModeledStopLoss:Number(((riskPts+1)*value+fee)*qty)};
  results.push(row);console.log("EXECUTION_TRADE",JSON.stringify(row));
 }
}
for(const exitType of ["3R","TRAIL"]){
 const rows=results.filter(r=>r.exitType===exitType);
 let equity=0,peak=0,drawdown=0;
 for(const r of rows){equity+=r.net;peak=Math.max(peak,equity);drawdown=Math.max(drawdown,peak-equity);}
 const withoutOutlier=rows.filter(r=>r.date!=="2026-09-28");
 console.log("EXECUTION_SUMMARY",JSON.stringify({exitType,trades:rows.length,net:Number(equity.toFixed(2)),maxClosedTradeDrawdown:Number(drawdown.toFixed(2)),wins:rows.filter(r=>r.net>0).length,ambiguous:rows.filter(r=>r.ambiguous).length,maxModeledStopLoss:Math.max(0,...rows.map(r=>r.maxModeledStopLoss)),netExcludingSep28:Number(withoutOutlier.reduce((s,r)=>s+r.net,0).toFixed(2)),sep28:rows.find(r=>r.date==="2026-09-28")?.net??null}));
}
console.log("EXECUTION_END",JSON.stringify({eligible,excluded,signals,missingFuture,orders:0,apiCalls:0,limitations:"One-minute OHLC cannot establish intrabar sequence; fills, MNQ prices, broker costs and margin not verified; in-sample only."}));

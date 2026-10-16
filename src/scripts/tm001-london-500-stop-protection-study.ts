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
/** Research-only $500 initial stop, breakeven and stepped trailing study. */
type Variant={name:string;trigger:number;distance:number;step:number};
const variants:Variant[]=[
{name:"BE10_TRAIL10",trigger:10,distance:10,step:10},
{name:"BE20_TRAIL10",trigger:20,distance:10,step:10},
{name:"BE25_TRAIL15",trigger:25,distance:15,step:10},
{name:"BE30_TRAIL20",trigger:30,distance:20,step:10}
];
type Result={date:string;variant:string;net:number;exit:string;stop:number;maxFavorable:number;breakevenArmed:boolean;ambiguous:boolean};
const results:Result[]=[];
let eligible=0,excluded=0;
console.log("=== TM001 $500 STOP PROFIT PROTECTION STUDY ===");
console.log("TEST_RULES",JSON.stringify({researchOnly:true,cacheOnly:true,apiCalls:0,orders:0,entry:"first London high rejection next bar open",direction:"SHORT",contracts:1,instrument:"NQ",initialStopPoints:25,initialGrossRisk:500,assumedRoundtripCost:40,assumedSlippagePoints:1,estimatedInitialTotalLoss:560,stopUpdates:"after completed bar only, never loosen",stepPoints:10,maxBars:30,variants,caveat:"One-minute OHLC cannot establish intrabar order. No live risk approval."}));
for(const [date,bars] of [...records].sort(([a],[b])=>a.localeCompare(b))){
 const london=bars.filter(b=>{const c=clock(b);return c.date===date&&c.m>=120&&c.m<540;});
 const opening=bars.filter(b=>{const c=clock(b);return c.date===date&&c.m>=570&&c.m<660;});
 if(!complete(london,120,420)||!complete(opening,570,90)){excluded++;continue;}
 eligible++;
 const lh=Math.max(...london.map(b=>b.high));
 const rejection=opening.find(b=>b.high>lh&&b.close<lh);
 if(!rejection)continue;
 const idx=bars.findIndex(b=>b.timestampMs===rejection.timestampMs);
 const future=bars.slice(idx+1,idx+31);
 if(future.length!==30||future.some((b,i)=>b.timestampMs!==rejection.timestampMs+(i+1)*60000))continue;
 const entry=future[0]!.open;
 for(const v of variants){
  let stop=entry+25,armed=false,lowest=entry,exit=future[29]!.close,reason="TIME",ambiguous=false,maxFavorable=0;
  for(let i=0;i<future.length;i++){
   const b=future[i]!;
   // Stop is active before any favorable movement in the current bar.
   if(i>0&&b.open>=stop){exit=b.open;reason="GAP_STOP";break;}
   if(b.high>=stop){exit=stop;reason="STOP";ambiguous=b.low<=entry-v.trigger&&!armed;break;}
   // Only use completed bars to activate and update stop for next bar.
   lowest=Math.min(lowest,b.low);
   maxFavorable=Math.max(maxFavorable,entry-b.low);
   if(entry-lowest>=v.trigger){
    armed=true;
    const steps=Math.floor((entry-lowest-v.trigger)/v.step);
    const candidate=Math.min(entry,lowest+v.distance);
    // Quantize ratchet to 10-point increments after trigger.
    const stepped=Math.min(entry,candidate+Math.max(0,(entry-lowest-v.trigger)-steps*v.step));
    stop=Math.min(stop,stepped);
   }
  }
  const net=Number(((entry-exit)*20-60).toFixed(2));
  const row={date,variant:v.name,net,exit:reason,stop:Number(stop.toFixed(2)),maxFavorable:Number(maxFavorable.toFixed(2)),breakevenArmed:armed,ambiguous};
  results.push(row);console.log("PROTECTION_TRADE",JSON.stringify(row));
 }
}
for(const v of variants){
 const group=results.filter(r=>r.variant===v.name);
 let net=0,peak=0,dd=0;
 for(const t of group){net+=t.net;peak=Math.max(peak,net);dd=Math.max(dd,peak-net);}
 console.log("PROTECTION_SUMMARY",JSON.stringify({variant:v.name,trades:group.length,wins:group.filter(t=>t.net>0).length,losses:group.filter(t=>t.net<0).length,net:Number(net.toFixed(2)),maxClosedDrawdown:Number(dd.toFixed(2)),breakevenArmed:group.filter(t=>t.breakevenArmed).length,ambiguous:group.filter(t=>t.ambiguous).length}));
}
console.log("PROTECTION_END",JSON.stringify({eligible,excluded,apiCalls:0,orders:0,warning:"Exploratory parameter sweep on already observed data; 25-point stop may be below structural rejection high; stop-first conservative OHLC assumption; no out-of-sample validation."}));

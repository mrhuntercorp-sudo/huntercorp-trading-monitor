/** TM001 London-high signal monitor: deterministic chronological cache replay.
 * No provider calls, no orders, no external notifications.
 */
import {createHash} from "node:crypto";
import {readdir,readFile} from "node:fs/promises";
import {join} from "node:path";
import {newYorkClock} from "../market/time.js";
import type {MinuteBar} from "../market/types.js";

const ticker="NQZ6";
const date=process.argv.find(x=>/^2026-\d{2}-\d{2}$/.test(x))??"2026-10-16";
const folder=join("data/cache/massive/NQ",ticker);
type Cache={schema:number;provider:string;ticker:string;productCode:string;utcDate:string;sha256:string;bars:MinuteBar[]};
const files=(await readdir(folder)).filter(f=>/^\d{4}-\d{2}-\d{2}(\.research)?\.json$/.test(f));
const byTimestamp=new Map<number,MinuteBar>();
let validated=0;
for(const file of files){
 const record=JSON.parse(await readFile(join(folder,file),"utf8")) as Cache;
 const hash=createHash("sha256").update(JSON.stringify(record.bars)).digest("hex");
 if(record.schema!==1||record.provider!=="massive"||record.ticker!==ticker||record.productCode!=="NQ"||
 record.sha256!==hash||!file.startsWith(record.utcDate+".")||!Array.isArray(record.bars))throw Error("INVALID_CACHE "+file);
 for(const b of record.bars){
  if(b.contractTicker!==ticker||b.productCode!=="NQ"||!Number.isSafeInteger(b.timestampMs)||b.timestampMs%60000!==0||
   ![b.open,b.high,b.low,b.close,b.volume].every(Number.isFinite)||b.low>b.high||
   b.low>Math.min(b.open,b.close)||b.high<Math.max(b.open,b.close))throw Error("INVALID_BAR "+file);
  if(newYorkClock(b.timestampMs).date===date){
   const old=byTimestamp.get(b.timestampMs);
   if(old&&JSON.stringify(old)!==JSON.stringify(b))throw Error("CONFLICTING_CACHED_BAR "+new Date(b.timestampMs).toISOString());
   byTimestamp.set(b.timestampMs,b);
  }
 }
 validated++;
}
const bars=[...byTimestamp.values()].sort((a,b)=>a.timestampMs-b.timestampMs);
const minute=(b:MinuteBar)=>{const t=newYorkClock(b.timestampMs);return t.hour*60+t.minute;};
const london=bars.filter(b=>minute(b)>=120&&minute(b)<540);
const opening=bars.filter(b=>minute(b)>=570&&minute(b)<660);
const complete=(bs:MinuteBar[],start:number,count:number)=>{
 const minutes=new Set(bs.map(minute));
 return Array.from({length:count},(_,i)=>minutes.has(start+i)).every(Boolean);
};
console.log("=== TM001 LONDON SIGNAL MONITOR REPLAY ===");
console.log("MONITOR_RULES",JSON.stringify({date,ticker,mode:"CHRONOLOGICAL_CACHE_REPLAY",apiCalls:0,orders:0,externalAlerts:0,
 london:"02:00-08:59 ET",entryWindow:"09:30-10:59 ET",signal:"high > londonHigh && close < londonHigh",
 entry:"next completed candle open",maxInitialModeledLoss:250,firstSignalOnly:true}));
console.log("MONITOR_COVERAGE",JSON.stringify({date,validatedCacheFiles:validated,bars:bars.length,londonBars:london.length,
 openingBars:opening.length,londonComplete:complete(london,120,420),openingComplete:complete(opening,570,90)}));
if(!complete(london,120,420)){console.log("MONITOR_BLOCKED",JSON.stringify({reason:"LONDON_INCOMPLETE",alerts:0}));process.exit(0);}
const londonHigh=Math.max(...london.map(b=>b.high));
console.log("LONDON_LEVEL_LOCKED",JSON.stringify({date,londonHigh,asOfEt:"09:00",source:"420_COMPLETE_ONE_MINUTE_CANDLES"}));
let signal:MinuteBar|undefined;
let inspected=0;
for(const bar of opening){
 inspected++;
 if(bar.high>londonHigh&&bar.close<londonHigh){
  signal=bar;
  const next=bars.find(b=>b.timestampMs===bar.timestampMs+60000);
  const initialStop=Math.max(londonHigh,bar.high)+0.25;
  const risk=next?initialStop-next.open:null;
  const nq=risk!==null&&risk>0&&(risk+1)*20+40<=250;
  const instrument=nq?"NQ":"MNQ";
  const qty=risk===null||risk<=0?0:nq?1:Math.floor(250/((risk+1)*2+4));
  console.log("SIGNAL_DETECTED",JSON.stringify({date,signalUtc:new Date(bar.timestampMs).toISOString(),
   londonHigh,rejectionHigh:bar.high,rejectionClose:bar.close,initialStop,
   status:next?"NEXT_BAR_AVAILABLE":"AWAIT_NEXT_BAR",researchOnly:true}));
  if(next&&risk!==null&&risk>0&&qty>=1){
   console.log("PAPER_ALERT",JSON.stringify({date,side:"SHORT",ticker,signalUtc:new Date(bar.timestampMs).toISOString(),
    nextBarUtc:new Date(next.timestampMs).toISOString(),modeledEntry:next.open,initialStop,
    structuralRiskPoints:Number(risk.toFixed(2)),instrument,qty,
    initialModeledLoss:Number((((risk+1)*(nq?20:2)+(nq?40:4))*qty).toFixed(2)),
    target3R:Number((next.open-3*risk).toFixed(2)),trailing:"BE30_TRAIL20",execution:"NONE"}));
  }else console.log("PAPER_ALERT_BLOCKED",JSON.stringify({reason:!next?"NEXT_BAR_NOT_CACHED":risk===null||risk<=0?"INVALID_STOP_RISK":"BUDGET_INSUFFICIENT"}));
  break;
 }
}
if(!signal)console.log("MONITOR_NO_SIGNAL",JSON.stringify({date,londonHigh,openingCandlesInspected:inspected,
 openingComplete:complete(opening,570,90),status:complete(opening,570,90)?"FINAL_NO_SIGNAL":"INCOMPLETE_PENDING"}));
console.log("MONITOR_END",JSON.stringify({date,signalDetected:Boolean(signal),apiCalls:0,orders:0,externalAlerts:0,
 caveat:"Replay only; does not watch a live feed or send phone alerts"}));

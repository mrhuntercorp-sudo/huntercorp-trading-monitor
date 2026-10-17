/** TM001 S2 cached-history structural audit, NOT a backtest.
 * Compare original permissive S2 candidate with stricter five-bar countertrend
 * close sequence. The strict filter is a diagnostic, not a selected strategy.
 */
import {createHash} from "node:crypto";
import {readdir,readFile} from "node:fs/promises";
import {join} from "node:path";
import {newYorkClock} from "../market/time.js";
import type {MinuteBar} from "../market/types.js";
type Cache={schema:number;provider:string;ticker:string;productCode:string;utcDate:string;sha256:string;bars:MinuteBar[]};
const ticker="NQZ6",dir=join("data/cache/massive/NQ",ticker);
const explicit=process.argv.slice(2).filter(x=>/^2026-\d\d-\d\d$/.test(x));
const all=new Map<string,Map<number,MinuteBar>>();
const files=(await readdir(dir)).filter(f=>/^\d{4}-\d\d-\d\d(\.research)?\.json$/.test(f));
for(const file of files){
 const c=JSON.parse(await readFile(join(dir,file),"utf8")) as Cache;
 if(c.schema!==1||c.provider!=="massive"||c.ticker!==ticker||c.productCode!=="NQ"||
 !file.startsWith(c.utcDate+".")||!Array.isArray(c.bars)||
 createHash("sha256").update(JSON.stringify(c.bars)).digest("hex")!==c.sha256)throw Error("INVALID_CACHE "+file);
 for(const b of c.bars){
  if(b.contractTicker!==ticker||b.productCode!=="NQ"||!Number.isSafeInteger(b.timestampMs)||b.timestampMs%60000!==0||
  ![b.open,b.high,b.low,b.close,b.volume].every(Number.isFinite)||
  b.low>Math.min(b.open,b.close)||b.high<Math.max(b.open,b.close))throw Error("INVALID_BAR "+file);
  const date=newYorkClock(b.timestampMs).date;
  if(explicit.length&&!explicit.includes(date))continue;
  if(!all.has(date))all.set(date,new Map());
  const m=all.get(date)!;const old=m.get(b.timestampMs);
  if(old&&JSON.stringify(old)!==JSON.stringify(b))throw Error("CONFLICTING_BAR "+date);
  m.set(b.timestampMs,b);
 }
}
const minute=(b:MinuteBar)=>{const c=newYorkClock(b.timestampMs);return c.hour*60+c.minute;};
type Signal={utc:string;side:"LONG"|"SHORT";price:number;retracement:number};
let eligible=0,blocked=0,original=0,strict=0,overlap=0,strictOverlap=0,londonSweepDays=0;
console.log("=== TM001 S2 STRUCTURAL AUDIT ===");
console.log("AUDIT_RULES",JSON.stringify({original:"Same permissive 15m impulse / 5-bar window / next close trigger as census",strictDiagnostic:"Five consecutive countertrend closes (each <= prior for LONG, >= prior for SHORT), with at least 15pt retracement; trigger on following bar close beyond prior close",londonSweep:"420 complete London minutes 02:00-08:59 ET; first 09:30-10:59 high > London high and close < London high",noOptimization:true,apiCalls:0,orders:0,externalAlerts:0}));
for(const date of [...all.keys()].sort()){
 const bars=[...all.get(date)!.values()].sort((a,b)=>a.timestampMs-b.timestampMs);
 const mins=new Map(bars.map(b=>[minute(b),b]));
 const o=Array.from({length:15},(_,i)=>mins.get(570+i));
 const w=Array.from({length:45},(_,i)=>mins.get(585+i));
 if(o.some(x=>!x)||w.some(x=>!x)){blocked++;console.log("AUDIT_DAY",JSON.stringify({date,status:"BLOCKED_INCOMPLETE",opening:o.filter(Boolean).length,search:w.filter(Boolean).length}));continue;}
 eligible++;
 const opening=o as MinuteBar[],search=w as MinuteBar[];
 const move=opening[14]!.close-opening[0]!.open;
 const side=move>=40?"LONG":move<=-40?"SHORT":null;
 const extreme=side==="LONG"?Math.max(...opening.map(x=>x.high)):side==="SHORT"?Math.min(...opening.map(x=>x.low)):0;
 const start=opening[0]!.open;
 const detect=(strictMode:boolean):Signal|null=>{
  if(!side)return null;
  for(let i=4;i<search.length-1;i++){
   const window=search.slice(i-4,i+1),next=search[i+1]!;
   const low=Math.min(...window.map(x=>x.low)),high=Math.max(...window.map(x=>x.high));
   const retrace=side==="LONG"?extreme-low:high-extreme;
   const intact=side==="LONG"?low>start:high<start;
   const sequence=window.every((bar,j)=>j===0||(side==="LONG"?bar.close<=window[j-1]!.close:bar.close>=window[j-1]!.close));
   const trigger=side==="LONG"?next.close>search[i]!.close:next.close<search[i]!.close;
   if(retrace>=15&&intact&&trigger&&(!strictMode||sequence))
    return {utc:new Date(next.timestampMs).toISOString(),side,price:next.close,retracement:Number(retrace.toFixed(2))};
  }
  return null;
 };
 const orig=detect(false),str=detect(true);
 const london=Array.from({length:420},(_,i)=>mins.get(120+i));
 const londonComplete=london.every(Boolean);
 const londonHigh=londonComplete?Math.max(...(london as MinuteBar[]).map(x=>x.high)):null;
 const sweep=londonHigh===null?null:Array.from({length:90},(_,i)=>mins.get(570+i)).find(b=>b&&b.high>londonHigh&&b.close<londonHigh);
 const sweepUtc=sweep?new Date(sweep.timestampMs).toISOString():null;
 if(orig)original++;
 if(str)strict++;
 if(sweep)londonSweepDays++;
 if(orig&&sweep)overlap++;
 if(str&&sweep)strictOverlap++;
 console.log("AUDIT_DAY",JSON.stringify({date,status:"ELIGIBLE",openingMove:Number(move.toFixed(2)),original:orig,strict:str,londonCoverageComplete:londonComplete,londonSweepUtc:sweepUtc,originalSameDayOverlap:!!(orig&&sweep),strictSameDayOverlap:!!(str&&sweep)}));
}
console.log("S2_AUDIT_END",JSON.stringify({dates:all.size,eligible,blocked,originalCandidates:original,strictDiagnosticCandidates:strict,londonSweepDays,originalOverlapDays:overlap,strictOverlapDays:strictOverlap,strictRuleIsDiagnosticOnly:true,notAProfitabilityTest:true,apiCalls:0,orders:0,externalAlerts:0}));

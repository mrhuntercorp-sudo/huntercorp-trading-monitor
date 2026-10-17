/** TM001 S2 exploratory NY trend-pullback census. Cache only; no optimization, P&L or orders.
 * Fixed hypothesis: first 15m directional impulse; 5m pullback; subsequent close
 * beyond preceding candle in impulse direction. One candidate/day, no fills assumed.
 */
import {createHash} from "node:crypto";
import {readdir,readFile} from "node:fs/promises";
import {join} from "node:path";
import {newYorkClock} from "../market/time.js";
import type {MinuteBar} from "../market/types.js";
type Cache={schema:number;provider:string;ticker:string;productCode:string;utcDate:string;sha256:string;bars:MinuteBar[]};
const ticker="NQZ6",dir=join("data/cache/massive/NQ",ticker);
const dates=process.argv.slice(2).filter(x=>/^2026-\d\d-\d\d$/.test(x));
if(!dates.length)throw Error("PROVIDE_DATES_EXPLICITLY");
const files=(await readdir(dir)).filter(f=>/^\d{4}-\d\d-\d\d(\.research)?\.json$/.test(f));
const byDate=new Map<string,Map<number,MinuteBar>>();
for(const file of files){
 const c=JSON.parse(await readFile(join(dir,file),"utf8")) as Cache;
 if(c.schema!==1||c.provider!=="massive"||c.ticker!==ticker||c.productCode!=="NQ"||
 !file.startsWith(c.utcDate+".")||!Array.isArray(c.bars)||
 createHash("sha256").update(JSON.stringify(c.bars)).digest("hex")!==c.sha256)throw Error("BAD_CACHE "+file);
 for(const b of c.bars){
  if(b.contractTicker!==ticker||b.productCode!=="NQ"||!Number.isSafeInteger(b.timestampMs)||b.timestampMs%60000!==0||
   ![b.open,b.high,b.low,b.close,b.volume].every(Number.isFinite)||
   b.low>Math.min(b.open,b.close)||b.high<Math.max(b.open,b.close))throw Error("BAD_BAR "+file);
  const d=newYorkClock(b.timestampMs).date;
  if(!dates.includes(d))continue;
  if(!byDate.has(d))byDate.set(d,new Map());
  const map=byDate.get(d)!;
  const prior=map.get(b.timestampMs);
  if(prior&&JSON.stringify(prior)!==JSON.stringify(b))throw Error("CONFLICTING_BAR "+d);
  map.set(b.timestampMs,b);
 }
}
const clockMinute=(b:MinuteBar)=>{const c=newYorkClock(b.timestampMs);return c.hour*60+c.minute;};
let eligible=0,candidates=0,blocked=0;
console.log("=== TM001 S2 NY TREND PULLBACK CENSUS ===");
console.log("FROZEN_DISCOVERY_RULES",JSON.stringify({opening:"09:30-09:44 ET, all 15 one-minute bars",impulse:"opening close minus opening open, absolute >= 40 NQ points",pullback:"09:45-10:29 ET; five consecutive completed bars with at least 15 points countertrend retracement from opening extreme, but not beyond opening start",trigger:"first subsequent closed minute bar through preceding close in trend direction, after pullback and by 10:29 ET",maxCandidatesPerDay:1,execution:"NONE",pnl:"NOT_EVALUATED",apiCalls:0,orders:0,externalAlerts:0}));
for(const date of dates){
 const map=byDate.get(date)??new Map<number,MinuteBar>();
 const bars=[...map.values()].sort((a,b)=>a.timestampMs-b.timestampMs);
 const mins=new Map(bars.map(b=>[clockMinute(b),b]));
 const opening=Array.from({length:15},(_,i)=>mins.get(570+i));
 const search=Array.from({length:45},(_,i)=>mins.get(585+i));
 if(opening.some(x=>!x)||search.some(x=>!x)){
  blocked++;console.log("S2_SESSION",JSON.stringify({date,status:"BLOCKED_INCOMPLETE",openingBars:opening.filter(Boolean).length,searchBars:search.filter(Boolean).length}));continue;
 }
 eligible++;
 const o=opening as MinuteBar[],w=search as MinuteBar[];
 const move=o[14]!.close-o[0]!.open;
 const direction=move>=40?"LONG":move<=-40?"SHORT":null;
 let signal:null|{time:string;price:number;pullbackPoints:number;side:string}=null;
 if(direction){
  const extreme=direction==="LONG"?Math.max(...o.map(b=>b.high)):Math.min(...o.map(b=>b.low));
  const start=o[0]!.open;
  for(let i=4;i<w.length-1;i++){
   const window=w.slice(i-4,i+1);
   const retrace=direction==="LONG"?extreme-Math.min(...window.map(b=>b.low)):Math.max(...window.map(b=>b.high))-extreme;
   const intact=direction==="LONG"?Math.min(...window.map(b=>b.low))>start:Math.max(...window.map(b=>b.high))<start;
   const next=w[i+1]!;
   const trigger=direction==="LONG"?next.close>w[i]!.close:next.close<w[i]!.close;
   if(retrace>=15&&intact&&trigger){
    signal={time:new Date(next.timestampMs).toISOString(),price:next.close,pullbackPoints:Number(retrace.toFixed(2)),side:direction};break;
   }
  }
 }
 if(signal)candidates++;
 console.log("S2_SESSION",JSON.stringify({date,status:signal?"CANDIDATE":"NO_CANDIDATE",openingMove:Number(move.toFixed(2)),...signal}));
}
console.log("S2_CENSUS_END",JSON.stringify({dates:dates.length,eligible,blocked,candidates,signalRate:eligible?Number((candidates/eligible).toFixed(3)):null,notATradingBacktest:true,apiCalls:0,orders:0,externalAlerts:0}));

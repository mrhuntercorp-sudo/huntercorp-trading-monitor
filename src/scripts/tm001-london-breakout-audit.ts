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
console.log("=== TM001 LONDON BREAKOUT EXPLORATORY AUDIT ===");
console.log("AUDIT_SCOPE",JSON.stringify({utcDays:records.size,files:files.length,source:"VERIFIED_LOCAL_CACHE",
 entryRules:"NONE",trades:0,requests:0,orders:0,exploratory:true}));
let eligible=0,breakouts=0,holds=0,failures=0,missing=0;
for(const [date,bars] of [...records].sort(([a],[b])=>a.localeCompare(b))){
 const london=bars.filter(b=>{const c=clock(b);return c.date===date&&c.m>=120&&c.m<540;});
 const opening=bars.filter(b=>{const c=clock(b);return c.date===date&&c.m>=570&&c.m<660;});
 if(!complete(london,120,420)||!complete(opening,570,90)){
  missing++;console.log("DAY",JSON.stringify({date,status:"INSUFFICIENT_SESSION_COVERAGE",
   londonBars:london.length,openingBars:opening.length}));continue;
 }
 eligible++;
 const level=Math.max(...london.map(b=>b.high));
 const first=opening.find(b=>b.close>level&&b.high>level);
 if(!first){
  console.log("DAY",JSON.stringify({date,status:"NO_CLOSE_ABOVE_LONDON_HIGH_BY_11",londonHigh:level}));
  continue;
 }
 breakouts++;
 const start=first.timestampMs+60000;
 const next30=bars.filter(b=>b.timestampMs>=start&&b.timestampMs<start+30*60000);
 const contiguous=next30.length===30&&next30.every((b,i)=>b.timestampMs===start+i*60000);
 if(!contiguous){
  console.log("DAY",JSON.stringify({date,status:"BREAKOUT_FOLLOWTHROUGH_INCOMPLETE",londonHigh:level,
   breakoutEt:clock(first).m,breakoutClose:first.close,availableFollowingBars:next30.length}));continue;
 }
 const below=next30.filter(b=>b.close<level);
 const above=next30.filter(b=>b.close>level);
 const high=Math.max(...next30.map(b=>b.high));
 const low=Math.min(...next30.map(b=>b.low));
 if(below.length)failures++;else holds++;
 console.log("DAY",JSON.stringify({date,status:"OBSERVED_30_MINUTES",londonHigh:level,
  breakoutTimeEt:String(Math.floor(clock(first).m/60)).padStart(2,"0")+":"+
   String(clock(first).m%60).padStart(2,"0"),
  breakoutClose:first.close,closesAbove:above.length,closesBelow:below.length,
  retestBars:next30.filter(b=>b.low<=level&&b.high>=level).length,
  maxFurtherUpsidePoints:high-first.close,maxDrawdownFromClosePoints:first.close-low,
  endCloseChangePoints:next30.at(-1)!.close-first.close,
  classification:below.length?"AT_LEAST_ONE_CLOSE_BACK_BELOW":"NO_CLOSE_BACK_BELOW",
  hypotheticalPnl:null}));
}
console.log("AUDIT_SUMMARY",JSON.stringify({eligibleDays:eligible,openingBreakouts:breakouts,
 observedNoCloseBackBelow:holds,observedAtLeastOneCloseBelow:failures,
 insufficientSessionDays:missing,
 caveat:"Breakout counts include cases without 30-minute follow-through; no trades or performance inferred",
 requests:0,orders:0}));

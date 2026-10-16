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
// Fixed, predeclared candidate: first close above London high by 11 ET,
// next minute open, 40-point stop, 80-point target, 30 bars, 2-point cost.
// This is an in-sample feasibility test, not independent validation.
const RULES={stop:40,target:80,bars:30,cost:2} as const;
type Outcome={date:string;net:number;reason:"STOP"|"TARGET"|"TIME";ambiguous:boolean};
const outcomes:Outcome[]=[];
let eligible=0,noSignal=0,quarantined=0,signalMissingExit=0;
console.log("=== TM001 FIXED LONDON BREAKOUT LONG SIMULATION ===");
console.log("SIM_RULES",JSON.stringify({signal:"FIRST_1M_CLOSE_ABOVE_LONDON_HIGH_0930_1059_ET",
 entry:"NEXT_BAR_OPEN",stopPoints:40,targetPoints:80,maxBars:30,roundTripCostPoints:2,
 stopFirstIfAmbiguous:true,oneSignalPerDay:true,cacheOnly:true,requests:0,orders:0,
 warning:"IN_SAMPLE_EXPLORATORY_NOT_VALIDATED"}));
for(const [date,bars] of [...records].sort(([a],[b])=>a.localeCompare(b))){
 const london=bars.filter(b=>{const c=clock(b);return c.date===date&&c.m>=120&&c.m<540;});
 const opening=bars.filter(b=>{const c=clock(b);return c.date===date&&c.m>=570&&c.m<660;});
 if(!complete(london,120,420)||!complete(opening,570,90)){
  quarantined++;console.log("DAY",JSON.stringify({date,status:"QUARANTINED_CONTEXT",
   londonBars:london.length,openingBars:opening.length}));continue;
 }
 eligible++;
 const londonHigh=Math.max(...london.map(b=>b.high));
 const signal=opening.find(b=>b.high>londonHigh&&b.close>londonHigh);
 if(!signal){noSignal++;console.log("DAY",JSON.stringify({date,status:"NO_SIGNAL",londonHigh}));continue;}
 const entryTime=signal.timestampMs+60000;
 const path=bars.filter(b=>b.timestampMs>=entryTime&&b.timestampMs<entryTime+RULES.bars*60000);
 if(path.length!==RULES.bars||path.some((b,i)=>b.timestampMs!==entryTime+i*60000)){
  signalMissingExit++;console.log("DAY",JSON.stringify({date,status:"QUARANTINED_EXIT_COVERAGE",
   londonHigh,signalUtc:new Date(signal.timestampMs).toISOString(),availableBars:path.length}));continue;
 }
 const entry=path[0]!.open,stop=entry-RULES.stop,target=entry+RULES.target;
 let exit=path.at(-1)!.close,reason:"STOP"|"TARGET"|"TIME"="TIME",ambiguous=false,exitIndex=RULES.bars-1;
 for(let i=0;i<path.length;i++){
  const b=path[i]!;
  if(b.high<b.low||b.high<Math.max(b.open,b.close)||b.low>Math.min(b.open,b.close))throw Error("INVALID_BAR "+date);
  if(i>0&&b.open<=stop){exit=b.open;reason="STOP";exitIndex=i;break;}
  if(i>0&&b.open>=target){exit=target;reason="TARGET";exitIndex=i;break;}
  const hitStop=b.low<=stop,hitTarget=b.high>=target;
  if(hitStop){exit=stop;reason="STOP";ambiguous=hitTarget;exitIndex=i;break;}
  if(hitTarget){exit=target;reason="TARGET";exitIndex=i;break;}
 }
 const net=Number((exit-entry-RULES.cost).toFixed(2));
 outcomes.push({date,net,reason,ambiguous});
 const t=clock(signal);
 console.log("DAY",JSON.stringify({date,status:"SIMULATED",londonHigh,
  signalEt:String(Math.floor(t.m/60)).padStart(2,"0")+":"+String(t.m%60).padStart(2,"0"),
  signalClose:signal.close,entry,stop,target,exit,reason,barsHeld:exitIndex+1,
  grossPoints:Number((exit-entry).toFixed(2)),netPoints:net,ambiguous,
  researchOnly:true}));
}
const netTotal=Number(outcomes.reduce((s,o)=>s+o.net,0).toFixed(2));
let equity=0,peak=0,maxDrawdown=0;
for(const o of outcomes){equity+=o.net;peak=Math.max(peak,equity);maxDrawdown=Math.max(maxDrawdown,peak-equity);}
console.log("SIM_SUMMARY",JSON.stringify({eligibleDays:eligible,noSignalDays:noSignal,
 signalsSimulated:outcomes.length,quarantinedContextDays:quarantined,
 quarantinedExitDays:signalMissingExit,
 wins:outcomes.filter(o=>o.net>0).length,losses:outcomes.filter(o=>o.net<0).length,
 stops:outcomes.filter(o=>o.reason==="STOP").length,
 targets:outcomes.filter(o=>o.reason==="TARGET").length,
 timeExits:outcomes.filter(o=>o.reason==="TIME").length,
 ambiguousStopFirst:outcomes.filter(o=>o.ambiguous).length,
 netTotalPoints:netTotal,averageNetPoints:outcomes.length?Number((netTotal/outcomes.length).toFixed(2)):null,
 maxClosedTradeDrawdownPoints:Number(maxDrawdown.toFixed(2)),
 caveat:"In-sample hypothetical results. No fills/slippage validation or independent out-of-sample proof.",
 requests:0,orders:0}));

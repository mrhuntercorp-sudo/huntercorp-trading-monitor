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
type Setup="HIGH_BREAK_LONG"|"HIGH_SWEEP_SHORT"|"LOW_BREAK_SHORT"|"LOW_SWEEP_LONG";
const setups:Setup[]=["HIGH_BREAK_LONG","HIGH_SWEEP_SHORT","LOW_BREAK_SHORT","LOW_SWEEP_LONG"];
const variants=[{contracts:1,stop:100,target:300},{contracts:5,stop:20,target:60}] as const;
const match=(s:Setup,b:MinuteBar,hi:number,lo:number)=>s==="HIGH_BREAK_LONG"?b.high>hi&&b.close>hi:s==="HIGH_SWEEP_SHORT"?b.high>hi&&b.close<hi:s==="LOW_BREAK_SHORT"?b.low<lo&&b.close<lo:b.low<lo&&b.close>lo;
const et=(b:MinuteBar)=>{const m=clock(b).m;return String(Math.floor(m/60)).padStart(2,"0")+":"+String(m%60).padStart(2,"0");};
type Trade={date:string;setup:Setup;contracts:number;grossDollars:number;reason:string;ambiguous:boolean};
const trades:Trade[]=[];
let eligible=0,excluded=0;
console.log("=== TM001 MNQ $200 RISK / $600 TARGET RESEARCH ===");
console.log("TEST_RULES",JSON.stringify({source:"NQZ6_1M_PROXY_FOR_MNQ_PRICE_MOVEMENT",
 variants:variants.map(v=>({...v,riskDollars:200,targetDollars:600})),
 signalWindow:"09:30-10:59_ET",entry:"NEXT_BAR_OPEN",maxBars:30,
 gapStopsAtOpen:true,stopFirst:true,commissionAndSlippage:"EXCLUDED_REPORT_GROSS",
 contractsIndependent:true,orders:0,requests:0,inSample:true}));
for(const [date,bars] of [...records].sort(([a],[b])=>a.localeCompare(b))){
 const london=bars.filter(b=>{const c=clock(b);return c.date===date&&c.m>=120&&c.m<540;});
 const opening=bars.filter(b=>{const c=clock(b);return c.date===date&&c.m>=570&&c.m<660;});
 if(!complete(london,120,420)||!complete(opening,570,90)){excluded++;continue;}
 eligible++;
 const hi=Math.max(...london.map(b=>b.high)),lo=Math.min(...london.map(b=>b.low));
 for(const setup of setups){
  const signal=opening.find(b=>match(setup,b,hi,lo));
  if(!signal)continue;
  const start=signal.timestampMs+60000;
  const path=bars.filter(b=>b.timestampMs>=start&&b.timestampMs<start+30*60000);
  if(path.length!==30||path.some((b,i)=>b.timestampMs!==start+i*60000)){
   console.log("MISSING_EXIT",JSON.stringify({date,setup,bars:path.length}));continue;
  }
  const isLong=setup.endsWith("LONG");
  for(const v of variants){
   const entry=path[0]!.open,stop=entry+(isLong?-v.stop:v.stop),target=entry+(isLong?v.target:-v.target);
   let exit=path[29]!.close,reason="TIME",ambiguous=false,held=30;
   for(let i=0;i<path.length;i++){
    const b=path[i]!;
    if(b.high<b.low||b.high<Math.max(b.open,b.close)||b.low>Math.min(b.open,b.close))throw Error("INVALID_BAR "+date);
    if(i>0&&(isLong?b.open<=stop:b.open>=stop)){exit=b.open;reason="STOP_GAP";held=i+1;break;}
    if(i>0&&(isLong?b.open>=target:b.open<=target)){exit=target;reason="TARGET";held=i+1;break;}
    const hitStop=isLong?b.low<=stop:b.high>=stop,hitTarget=isLong?b.high>=target:b.low<=target;
    if(hitStop){exit=stop;reason="STOP";ambiguous=hitTarget;held=i+1;break;}
    if(hitTarget){exit=target;reason="TARGET";held=i+1;break;}
   }
   const grossDollars=Number(((isLong?exit-entry:entry-exit)*2*v.contracts).toFixed(2));
   trades.push({date,setup,contracts:v.contracts,grossDollars,reason,ambiguous});
   console.log("TRADE",JSON.stringify({date,setup,contracts:v.contracts,signalEt:et(signal),
    entry,stop,target,exit,reason,heldBars:held,grossDollars,ambiguous,
    estimatedNetDollars:null,feesNotIncluded:true}));
  }
 }
}
for(const setup of setups)for(const v of variants){
 const rows=trades.filter(t=>t.setup===setup&&t.contracts===v.contracts);
 let equity=0,peak=0,drawdown=0;
 for(const t of rows){equity+=t.grossDollars;peak=Math.max(peak,equity);drawdown=Math.max(drawdown,peak-equity);}
 console.log("VARIANT_SUMMARY",JSON.stringify({setup,contracts:v.contracts,trades:rows.length,
  wins:rows.filter(t=>t.grossDollars>0).length,losses:rows.filter(t=>t.grossDollars<0).length,
  targets:rows.filter(t=>t.reason==="TARGET").length,
  stops:rows.filter(t=>t.reason.startsWith("STOP")).length,
  timeExits:rows.filter(t=>t.reason==="TIME").length,
  grossDollars:Number(equity.toFixed(2)),
  averageGrossDollars:rows.length?Number((equity/rows.length).toFixed(2)):null,
  maxClosedTradeDrawdownDollars:Number(drawdown.toFixed(2)),
  ambiguousBars:rows.filter(t=>t.ambiguous).length,
  netAfterFees:"NOT_CALCULATED"}));
}
console.log("TEST_SUMMARY",JSON.stringify({eligibleDays:eligible,excludedContextDays:excluded,
 warning:"NQ proxy prices, gross-only, in-sample, 30-minute timeout, no MNQ-specific fill validation",
 requests:0,orders:0}));

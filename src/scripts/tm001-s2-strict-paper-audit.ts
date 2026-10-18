/** S2 STRICT DIAGNOSTIC paper outcomes: cache only, no optimization/orders.
 * Rules are an explicitly provisional fixed evaluation contract, NOT approved strategy.
 */
import {createHash} from "node:crypto";
import {readdir,readFile} from "node:fs/promises";
import {join} from "node:path";
import {newYorkClock} from "../market/time.js";
import type {MinuteBar} from "../market/types.js";
type Cache={schema:number;provider:string;ticker:string;productCode:string;utcDate:string;sha256:string;bars:MinuteBar[]};
const ticker="NQZ6",dir=join("data/cache/massive/NQ",ticker);
const all=new Map<string,Map<number,MinuteBar>>();
for(const file of (await readdir(dir)).filter(f=>/^\d{4}-\d\d-\d\d(\.research)?\.json$/.test(f))){
 const c=JSON.parse(await readFile(join(dir,file),"utf8")) as Cache;
 if(c.schema!==1||c.provider!=="massive"||c.ticker!==ticker||c.productCode!=="NQ"||
 !file.startsWith(c.utcDate+".")||!Array.isArray(c.bars)||
 createHash("sha256").update(JSON.stringify(c.bars)).digest("hex")!==c.sha256)throw Error("INVALID_CACHE "+file);
 for(const b of c.bars){
  if(b.contractTicker!==ticker||b.productCode!=="NQ"||!Number.isSafeInteger(b.timestampMs)||b.timestampMs%60000!==0||
  ![b.open,b.high,b.low,b.close,b.volume].every(Number.isFinite)||
  b.low>Math.min(b.open,b.close)||b.high<Math.max(b.open,b.close))throw Error("INVALID_BAR "+file);
  const date=newYorkClock(b.timestampMs).date;
  if(!all.has(date))all.set(date,new Map());
  const map=all.get(date)!,old=map.get(b.timestampMs);
  if(old&&JSON.stringify(old)!==JSON.stringify(b))throw Error("CONFLICTING_BAR "+date);
  map.set(b.timestampMs,b);
 }
}
const minute=(b:MinuteBar)=>{const t=newYorkClock(b.timestampMs);return t.hour*60+t.minute;};
const round=(n:number)=>Number(n.toFixed(2));
const outcomes:number[]=[];
let strictCandidates=0,blocked=0,skippedRisk=0,overlap=0,unverifiedLondon=0,winning=0;
console.log("=== TM001 S2 STRICT PAPER OUTCOME AUDIT ===");
console.log("PAPER_RULES",JSON.stringify({signal:"Same strict five countertrend closes and following continuation close as S2 structural audit",entry:"Next one-minute bar OPEN after confirmed trigger CLOSE; zero lookahead",stop:"LONG below minimum low of five pullback bars minus 0.25; SHORT above maximum high plus 0.25",target:"3R structural risk",deadline:"30 completed one-minute bars after entry, exit at last close",risk:"$250 maximum modeled initial loss; 1 NQ if affordable else integer MNQ",fees:"NQ $40 roundtrip, MNQ $4 roundtrip",slippage:"1 NQ point roundtrip charged on exit, stop-first OHLC",gap:"Stop execution at worse of stop or bar open, before slippage; gap can exceed budget",overlap:"London sweep must occur BEFORE S2 entry to claim daily slot; incomplete London flagged unknown",apiCalls:0,orders:0,externalAlerts:0,optimization:false}));
for(const date of [...all.keys()].sort()){
 const map=all.get(date)!;
 const mins=new Map([...map.values()].map(b=>[minute(b),b]));
 const opening=Array.from({length:15},(_,i)=>mins.get(570+i));
 const search=Array.from({length:45},(_,i)=>mins.get(585+i));
 if(opening.some(x=>!x)||search.some(x=>!x))continue;
 const o=opening as MinuteBar[],w=search as MinuteBar[];
 const move=o[14]!.close-o[0]!.open;
 const side=move>=40?"LONG":move<=-40?"SHORT":null;
 if(!side)continue;
 const extreme=side==="LONG"?Math.max(...o.map(b=>b.high)):Math.min(...o.map(b=>b.low));
 const start=o[0]!.open;
 let found:{trigger:MinuteBar;window:MinuteBar[]}|null=null;
 for(let i=4;i<w.length-1;i++){
  const window=w.slice(i-4,i+1),trigger=w[i+1]!;
  const low=Math.min(...window.map(b=>b.low)),high=Math.max(...window.map(b=>b.high));
  const retrace=side==="LONG"?extreme-low:high-extreme;
  const intact=side==="LONG"?low>start:high<start;
  const sequence=window.every((b,j)=>j===0||(side==="LONG"?b.close<=window[j-1]!.close:b.close>=window[j-1]!.close));
  const confirms=side==="LONG"?trigger.close>w[i]!.close:trigger.close<w[i]!.close;
  if(retrace>=15&&intact&&sequence&&confirms){found={trigger,window};break;}
 }
 if(!found)continue;
 strictCandidates++;
 const {trigger,window}=found;
 const entryMinute=minute(trigger)+1;
 const entryBar=mins.get(entryMinute);
 const stop=side==="LONG"?Math.min(...window.map(b=>b.low))-0.25:Math.max(...window.map(b=>b.high))+0.25;
 const londonBars=Array.from({length:420},(_,i)=>mins.get(120+i));
 const londonComplete=londonBars.every(Boolean);
 const londonHigh=londonComplete?Math.max(...(londonBars as MinuteBar[]).map(b=>b.high)):null;
 const londonFirst=londonHigh===null?null:Array.from({length:90},(_,i)=>mins.get(570+i)).find(b=>b&&b.high>londonHigh&&b.close<londonHigh);
 const priorSweep=!!londonFirst&&londonFirst.timestampMs<=trigger.timestampMs;
 if(!londonComplete)unverifiedLondon++;
 if(priorSweep)overlap++;
 const base={date,side,signalUtc:new Date(trigger.timestampMs).toISOString(),entryUtc:entryBar?new Date(entryBar.timestampMs).toISOString():null,stop,londonStatus:londonComplete?(priorSweep?"PRIOR_SWEEP":"NO_PRIOR_SWEEP"):"UNKNOWN_INCOMPLETE",sweepUtc:londonFirst?new Date(londonFirst.timestampMs).toISOString():null};
 if(!entryBar){blocked++;console.log("S2_PAPER",JSON.stringify({...base,status:"BLOCKED_MISSING_ENTRY"}));continue;}
 const entry=entryBar.open;
 const risk=side==="LONG"?entry-stop:stop-entry;
 const qtyNQ=risk>0&&(risk+1)*20+40<=250;
 const instrument=qtyNQ?"NQ":"MNQ",pointValue=qtyNQ?20:2,fee=qtyNQ?40:4;
 const qty=risk>0?(qtyNQ?1:Math.floor(250/((risk+1)*pointValue+fee))):0;
 if(qty<1){skippedRisk++;console.log("S2_PAPER",JSON.stringify({...base,status:"BLOCKED_RISK",entry,risk:round(risk)}));continue;}
 const target=side==="LONG"?entry+3*risk:entry-3*risk;
 let exit:null|{price:number;reason:string;minute:number}=null;
 let mfe=0,mae=0;
 const deadline=entryMinute+29;
 for(let m=entryMinute;m<=deadline;m++){
  const b=mins.get(m);
  if(!b){blocked++;exit=null;break;}
  const favorable=side==="LONG"?b.high-entry:entry-b.low;
  const adverse=side==="LONG"?entry-b.low:b.high-entry;
  mfe=Math.max(mfe,favorable);mae=Math.max(mae,adverse);
  const stopHit=side==="LONG"?b.low<=stop:b.high>=stop;
  const targetHit=side==="LONG"?b.high>=target:b.low<=target;
  if(stopHit){exit={price:side==="LONG"?Math.min(stop,b.open):Math.max(stop,b.open),reason:targetHit?"STOP_FIRST_BOTH_TOUCHED":"STOP",minute:m};break;}
  if(targetHit){exit={price:side==="LONG"?Math.max(target,b.open):Math.min(target,b.open),reason:"TARGET",minute:m};break;}
  if(m===deadline)exit={price:b.close,reason:"TIME",minute:m};
 }
 if(!exit){console.log("S2_PAPER",JSON.stringify({...base,status:"BLOCKED_INCOMPLETE_EXIT",entry,qty,instrument}));continue;}
 const points=side==="LONG"?exit.price-entry:entry-exit.price;
 const net=round((points-1)*pointValue*qty-fee*qty);
 outcomes.push(net);if(net>0)winning++;
 console.log("S2_PAPER",JSON.stringify({...base,status:"MODELED",entry,risk:round(risk),qty,instrument,modeledInitialLoss:round(((risk+1)*pointValue+fee)*qty),target:round(target),exitPrice:exit.price,exitReason:exit.reason,exitMinuteEt:exit.minute,netUsd:net,mfePoints:round(mfe),maePoints:round(mae),countsUnderOneTradePerDay:!priorSweep&&londonComplete}));
}
const sum=round(outcomes.reduce((a,b)=>a+b,0));
console.log("S2_PAPER_END",JSON.stringify({strictCandidates,modeled:outcomes.length,blocked,skippedRisk,priorLondonSweepOverlap:overlap,unknownLondonCoverage:unverifiedLondon,positiveOutcomes:winning,netUsd:sum,averageNetUsd:outcomes.length?round(sum/outcomes.length):null,smallSample:true,retrospective:true,noOptimization:true,apiCalls:0,orders:0,externalAlerts:0}));

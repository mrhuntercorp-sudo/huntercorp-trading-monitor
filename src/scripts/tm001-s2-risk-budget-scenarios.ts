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
const budgets=[250,500,750,1000] as const;
const ledger=new Map<number,Array<{date:string;net:number;instrument:string;qty:number;priorSweep:boolean}>>(budgets.map(b=>[b,[]]));
const outcomes:number[]=[];
let strictCandidates=0,blocked=0,skippedRisk=0,overlap=0,unverifiedLondon=0,winning=0;
console.log("=== TM001 S2 RISK BUDGET SCENARIO AUDIT ===");
console.log("SCENARIO_RULES",JSON.stringify({signal:"Same strict five countertrend closes and following continuation close as S2 structural audit",entry:"Next one-minute bar OPEN after confirmed trigger CLOSE; zero lookahead",stop:"LONG below minimum low of five pullback bars minus 0.25; SHORT above maximum high plus 0.25",target:"3R structural risk",deadline:"30 completed one-minute bars after entry, exit at last close",risk:"Compare $250/$500/$750/$1000; prefer 2 NQ if affordable, else 1 NQ, else integer MNQ",fees:"NQ $40 roundtrip, MNQ $4 roundtrip",slippage:"1 NQ point roundtrip charged on exit, stop-first OHLC",gap:"Stop execution at worse of stop or bar open, before slippage; gap can exceed budget",overlap:"London sweep must occur BEFORE S2 entry to claim daily slot; incomplete London flagged unknown",apiCalls:0,orders:0,externalAlerts:0,optimization:false}));
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
 const target=side==="LONG"?entry+3*risk:entry-3*risk;
 let exit:null|{price:number;reason:string;minute:number}=null;
 const deadline=entryMinute+29;
 for(let m=entryMinute;m<=deadline;m++){
  const b=mins.get(m);
  if(!b){exit=null;break;}
  const stopHit=side==="LONG"?b.low<=stop:b.high>=stop;
  const targetHit=side==="LONG"?b.high>=target:b.low<=target;
  if(stopHit){exit={price:side==="LONG"?Math.min(stop,b.open):Math.max(stop,b.open),reason:targetHit?"STOP_FIRST_BOTH_TOUCHED":"STOP",minute:m};break;}
  if(targetHit){exit={price:side==="LONG"?Math.max(target,b.open):Math.min(target,b.open),reason:"TARGET",minute:m};break;}
  if(m===deadline)exit={price:b.close,reason:"TIME",minute:m};
 }
 if(!exit){blocked++;console.log("RISK_SIGNAL",JSON.stringify({...base,status:"BLOCKED_EXIT_DATA"}));continue;}
 for(const budget of budgets){
  const twoNqLoss=2*((risk+1)*20+40);
  const oneNqLoss=(risk+1)*20+40;
  const instrument=twoNqLoss<=budget?"NQ":oneNqLoss<=budget?"NQ":"MNQ";
  const pointValue=instrument==="NQ"?20:2,fee=instrument==="NQ"?40:4;
  const qty=instrument==="NQ"?(twoNqLoss<=budget?2:1):risk>0?Math.floor(budget/((risk+1)*2+4)):0;
  if(risk<=0||qty<1){skippedRisk++;console.log("RISK_SIGNAL",JSON.stringify({...base,budget,status:"BLOCKED_RISK",entry,risk:round(risk)}));continue;}
  const points=side==="LONG"?exit.price-entry:entry-exit.price;
  const net=round((points-1)*pointValue*qty-fee*qty);
  ledger.get(budget)!.push({date,net,instrument,qty,priorSweep});
  console.log("RISK_SIGNAL",JSON.stringify({...base,budget,status:"MODELED",entry,risk:round(risk),instrument,qty,twoNqFits:twoNqLoss<=budget,initialModeledLoss:round(((risk+1)*pointValue+fee)*qty),exitReason:exit.reason,netUsd:net}));
 }

}
for(const budget of budgets){
 const trades=ledger.get(budget)!;
 for(const mode of ["FIXED","CLOSED_EQUITY_TRAILING"] as const){
  let equity=0,peak=0,highWater=0,maxDrawdown=0,breachAt:null|string=null;
  let count=0,netAtBreach=0;
  for(const trade of trades){
   if(breachAt)break;
   equity=round(equity+trade.net);count++;
   peak=Math.max(peak,equity);
   highWater=Math.max(highWater,equity);
   maxDrawdown=Math.max(maxDrawdown,peak-equity);
   const floor=mode==="FIXED"?-2000:highWater-2000;
   if(equity<=floor){breachAt=trade.date;netAtBreach=equity;}
  }
  console.log("RISK_SCENARIO",JSON.stringify({budget,mode,signals:strictCandidates,modeledTrades:trades.length,twoNqTrades:trades.filter(t=>t.instrument==="NQ"&&t.qty===2).length,oneNqTrades:trades.filter(t=>t.instrument==="NQ"&&t.qty===1).length,mnqTrades:trades.filter(t=>t.instrument==="MNQ").length,allTradeNet:round(trades.reduce((a,t)=>a+t.net,0)),allTradeMaxClosedDrawdown:(()=>{let e=0,p=0,d=0;for(const t of trades){e+=t.net;p=Math.max(p,e);d=Math.max(d,p-e);}return round(d);})(),accountBreached:!!breachAt,firstBreachDate:breachAt,tradesBeforeOrAtBreach:count,equityAtBreach:breachAt?netAtBreach:null,closedOnly:true,intratradeDrawdownNotModeled:true,smallSample:true}));
 }
}
console.log("RISK_AUDIT_END",JSON.stringify({strictCandidates,blocked,skippedRisk,priorLondonSweepOverlap:overlap,unknownLondonCoverage:unverifiedLondon,apiCalls:0,orders:0,externalAlerts:0}));

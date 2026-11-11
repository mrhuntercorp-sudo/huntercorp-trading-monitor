import {generateP4Signals} from "../research/p4-nq-signals.js";
/** Frozen retrospective cross-contract comparison. No tuning, API calls, writes or orders. */
import {readdir,readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {join} from "node:path";
import {newYorkClock} from "../market/time.js";
import type {MinuteBar} from "../market/types.js";
const clock=(b:MinuteBar)=>{const t=newYorkClock(b.timestampMs);return {date:t.date,m:t.hour*60+t.minute};};
const complete=(bars:MinuteBar[],start:number,count:number)=>{const minutes=new Set(bars.map(b=>clock(b).m));return Array.from({length:count},(_,i)=>start+i).every(m=>minutes.has(m));};
const root="data/cache/massive/NQ";
type RecordData={schema:number;provider:string;ticker:string;productCode:string;utcDate:string;sha256:string;bars:MinuteBar[]};
let researchSelected=0,standardSelected=0;
const tickers=(await readdir(root,{withFileTypes:true})).filter(x=>x.isDirectory()&&/^NQ[A-Z][0-9]$/.test(x.name)).map(x=>x.name).sort();
const byContract=new Map<string,Map<string,Map<number,MinuteBar>>>();
for(const ticker of tickers){
 const days=new Map<string,Map<number,MinuteBar>>();
 const names=(await readdir(join(root,ticker))).filter(x=>/^\d{4}-\d{2}-\d{2}(\.research)?\.json$/.test(x)).sort();
 if(names.length===0)throw Error("NO_CACHE_FILES_MATCHED "+ticker+"; inspect filename regex");
 const selected=new Map<string,{name:string;bars:MinuteBar[]}>();
 for(const name of names){
  const d=JSON.parse(await readFile(join(root,ticker,name),"utf8")) as RecordData;
  if(d.schema!==1||d.provider!=="massive"||d.ticker!==ticker||d.productCode!=="NQ"||!name.startsWith(d.utcDate+".")||!Array.isArray(d.bars)||createHash("sha256").update(JSON.stringify(d.bars)).digest("hex")!==d.sha256)throw Error("CACHE_INVALID "+ticker+"/"+name);
  if(d.bars.some((bar,i)=>bar.contractTicker!==ticker||bar.productCode!=="NQ"||!Number.isSafeInteger(bar.timestampMs)||bar.timestampMs%60000!==0||(i>0&&bar.timestampMs<=d.bars[i-1]!.timestampMs)))throw Error("BAR_INVALID "+ticker+"/"+name);
  const previous=selected.get(d.utcDate);
  if(!previous||d.bars.length>previous.bars.length)selected.set(d.utcDate,{name,bars:d.bars});
 }
 for(const {name,bars} of selected.values()){
  if(name.endsWith(".research.json"))researchSelected++;else standardSelected++;
  for(const bar of bars){
   const c=newYorkClock(bar.timestampMs),minute=c.hour*60+c.minute;
   const day=days.get(c.date)??new Map<number,MinuteBar>();
   if(day.has(minute))throw Error("DUPLICATE_NY_MINUTE "+ticker+" "+c.date+" "+minute);
   day.set(minute,bar);days.set(c.date,day);
  }
 }
 byContract.set(ticker,days);
}



const dates=[...new Set([...byContract.values()].flatMap(days=>[...days.keys()]))].sort();
const round=(n:number)=>Number(n.toFixed(2));
type ExitName="STEPPED_30_20"|"STEPPED_40_20";
type Outcome={net:number;exit:number;reason:string;exitIndex:number;favorableAfterExit:number;exitName:ExitName;worstHigh:number};
const names:ExitName[]=["STEPPED_30_20","STEPPED_40_20"];
type Raw={date:string;entry:number;initialStop:number;risk:number;future:MinuteBar[]};
const raw:Raw[]=[];
const eligibleDates:string[]=[];
let eligible=0,signals=0,blocked=0,rollExcluded=0,incomplete=0;
const simulate=(future:MinuteBar[],entry:number,initialStop:number,risk:number,dollar:number,fee:number,qty:number,exitName:ExitName,extraStopSlippage:number):Outcome=>{
 let stop=initialStop,lowest=entry,armed=false,exit=future[29]!.close,exitIndex=29,reason="TIME",worstHigh=entry;
 const config=exitName==="STEPPED_30_20"?{activation:30,lock:10}:{activation:40,lock:20};
 for(let i=0;i<future.length;i++){
  const bar=future[i]!;
  if(armed){
   const steps=Math.floor((entry-lowest-config.activation)/10);
   const candidate=entry-config.lock-steps*10;
   if(candidate<stop)stop=candidate;
  }
  if(i>0&&bar.open>=stop){exit=bar.open+extraStopSlippage;exitIndex=i;reason="STOP_GAP";worstHigh=Math.max(worstHigh,exit);break;}
  if(bar.high>=stop){exit=stop+extraStopSlippage;exitIndex=i;reason="STOP";worstHigh=Math.max(worstHigh,exit);break;}
  worstHigh=Math.max(worstHigh,bar.high);
  lowest=Math.min(lowest,bar.low);
  if(entry-lowest>=config.activation)armed=true;
 }
 const after=future.slice(exitIndex+1);
 const favorableAfterExit=after.length?round(Math.max(0,entry-Math.min(...after.map(x=>x.low)))):0;
 return {net:round(((entry-exit-1)*dollar-fee)*qty),exit,reason,exitIndex,favorableAfterExit,exitName,worstHigh};
};
for(const date of dates){
 const candidates=tickers.filter(t=>{const day=byContract.get(t)!.get(date);return day&&complete([...day.values()],120,420)&&complete([...day.values()],570,90)&&complete([...day.values()],660,30);});
 let ticker:string|undefined;
 if(date>="2026-09-14"){ticker=candidates.includes("NQZ6")?"NQZ6":undefined;}
 else if(candidates.length===1){ticker=candidates[0];}
 else if(candidates.length>1){rollExcluded++;continue;}
 if(!ticker){incomplete++;continue;}
 const bars=[...byContract.get(ticker)!.get(date)!.values()].sort((a,b)=>a.timestampMs-b.timestampMs);
 eligible++;eligibleDates.push(date);
 const london=bars.filter(b=>{const c=clock(b);return c.date===date&&c.m>=120&&c.m<540;});
 const opening=bars.filter(b=>{const c=clock(b);return c.date===date&&c.m>=570&&c.m<660;});
 const high=Math.max(...london.map(b=>b.high));
 const rejection=opening.find(b=>b.high>high&&b.close<high);
 if(!rejection)continue;
 signals++;
 const idx=bars.findIndex(b=>b.timestampMs===rejection.timestampMs);
 const future=bars.slice(idx+1,idx+31);
 if(future.length!==30||future.some((b,i)=>b.timestampMs!==rejection.timestampMs+(i+1)*60000)){blocked++;continue;}
 const entry=future[0]!.open,initialStop=Math.max(high,rejection.high)+0.25,risk=initialStop-entry;
 if(risk<=0){blocked++;continue;}

 raw.push({date,entry,initialStop,risk,future});
}



/** Independent London-low target audit. Frozen S1 entry and original stop. */
const stats=(a:number[])=>a.length?round(a.reduce((x,y)=>x+y,0)/a.length):null;
type Result={date:string;entry:number;stop:number;target:number;riskPoints:number;rewardPoints:number;outcome:"TARGET"|"STOP"|"TIME"|"AMBIGUOUS";minutes:number;maxAdverse:number;maxFavorable:number;targetFirstWithin30:boolean;fullRth:boolean};
const results:Result[]=[];const excluded:{date:string;reason:string}[]=[];
for(const t of raw){
 const ticker=t.future[0]!.contractTicker;
 const day=byContract.get(ticker)?.get(t.date);
 if(!day){excluded.push({date:t.date,reason:"MISSING_CONTRACT"});continue;}
 const london=[...day.values()].filter(b=>{const c=clock(b);return c.m>=120&&c.m<540;});
 if(!complete(london,120,420)){excluded.push({date:t.date,reason:"LONDON_INCOMPLETE"});continue;}
 const target=Math.min(...london.map(b=>b.low));
 if(target>=t.entry){excluded.push({date:t.date,reason:"TARGET_NOT_BELOW_ENTRY"});continue;}
 const future=[...day.values()].filter(b=>b.timestampMs>=t.future[0]!.timestampMs&&clock(b).m<960).sort((a,b)=>a.timestampMs-b.timestampMs);
 if(!future.length||future.some((b,i)=>i>0&&b.timestampMs!==future[i-1]!.timestampMs+60000)){
  excluded.push({date:t.date,reason:"NONCONTIGUOUS_FUTURE"});continue;
 }
 const fullRth=complete([...day.values()],570,390);
 let maxAdverse=0,maxFavorable=0,outcome:Result["outcome"]="TIME",minutes=future.length;
 for(let i=0;i<future.length;i++){
  const b=future[i]!;
  maxAdverse=Math.max(maxAdverse,b.high-t.entry);
  maxFavorable=Math.max(maxFavorable,t.entry-b.low);
  const stop=b.high>=t.initialStop,targetHit=b.low<=target;
  if(stop&&targetHit){outcome="AMBIGUOUS";minutes=i+1;break;}
  if(stop){outcome="STOP";minutes=i+1;break;}
  if(targetHit){outcome="TARGET";minutes=i+1;break;}
 }
 results.push({date:t.date,entry:t.entry,stop:t.initialStop,target,riskPoints:round(t.risk),rewardPoints:round(t.entry-target),outcome,minutes,maxAdverse:round(maxAdverse),maxFavorable:round(maxFavorable),targetFirstWithin30:outcome==="TARGET"&&minutes<=30,fullRth});
}
console.log("LOW_TARGET_COVERAGE",JSON.stringify({s1Signals:raw.length,evaluated:results.length,fullRth:results.filter(r=>r.fullRth).length,excluded,apiCalls:0,orders:0}));
const summary=(arr:Result[])=>({n:arr.length,target:arr.filter(r=>r.outcome==="TARGET").length,stop:arr.filter(r=>r.outcome==="STOP").length,ambiguous:arr.filter(r=>r.outcome==="AMBIGUOUS").length,unresolved:arr.filter(r=>r.outcome==="TIME").length,targetWithin30:arr.filter(r=>r.targetFirstWithin30).length,meanTargetMinutes:stats(arr.filter(r=>r.outcome==="TARGET").map(r=>r.minutes)),meanInitialRiskPoints:stats(arr.map(r=>r.riskPoints)),meanRewardPoints:stats(arr.map(r=>r.rewardPoints))});
console.log("LOW_TARGET_ALL",JSON.stringify(summary(results)));
console.log("LOW_TARGET_37",JSON.stringify(summary(results.filter(r=>r.date>="2026-08-20"&&r.date<="2026-10-09"))));
for(const r of results)console.log("LOW_TARGET_TRADE",JSON.stringify(r));
console.log("LOW_TARGET_LIMITATIONS",JSON.stringify({notes:["S1 first rejection, next-minute open and original stop frozen; stop never trails in this experimental target-only exit","London low target, no additional entries; first-touch competing outcomes on 1m OHLC, simultaneous touch flagged ambiguous","Incomplete RTH cases are censored at last available bar, never assumed successful","No forced 30-minute exit in full-session target outcome; targetWithin30 separately reported","Retrospective cached sessions only; no transaction costs, gaps or Topstep pass estimates in this event-order audit","Zero API calls and orders"]}));

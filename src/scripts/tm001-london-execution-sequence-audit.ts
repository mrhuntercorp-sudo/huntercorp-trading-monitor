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
if(!dates.length)throw Error("EMPTY_CACHE");
const selections:{date:string;ticker:string;bars:MinuteBar[]}[]=[];
let rollExcluded=0,incompleteExcluded=0,originalExcluded=0;
for(const date of dates){
 if(date>="2026-09-14"){originalExcluded++;continue;}
 const candidates=tickers.filter(ticker=>{const day=byContract.get(ticker)!.get(date);return day&&complete([...day.values()],120,420)&&complete([...day.values()],570,90)&&complete([...day.values()],660,30);});
 if(candidates.length>1){rollExcluded++;console.log("HOLDOUT_ROLL_EXCLUDED",JSON.stringify({date,tickers:candidates}));continue;}
 if(candidates.length===0){incompleteExcluded++;continue;}
 const ticker=candidates[0]!,day=byContract.get(ticker)!.get(date)!;
 const bars=[...day.values()].sort((a,b)=>a.timestampMs-b.timestampMs);
 selections.push({date,ticker,bars});
 console.log("HOLDOUT_SELECTED",JSON.stringify({date,ticker}));
}

/** Independent chronological fill-order review; original simulator is not changed. */
console.log("=== TM001 INDEPENDENT EXECUTION SEQUENCE AUDIT ===");
type Mode="STRUCTURAL_3R"|"STRUCTURAL_BE30_TRAIL20";
const modes:Mode[]=["STRUCTURAL_3R","STRUCTURAL_BE30_TRAIL20"];
const results:{date:string;ticker:string;mode:Mode;net:number;reason:string;entry:number;exit:number;qty:number;maxInitialLoss:number;issues:string[]}[]=[];
let signals=0,skipped=0;
for(const {date,ticker,bars} of selections){
 const london=bars.filter(b=>clock(b).date===date&&clock(b).m>=120&&clock(b).m<540);
 const opening=bars.filter(b=>clock(b).date===date&&clock(b).m>=570&&clock(b).m<660);
 const high=Math.max(...london.map(b=>b.high));
 const rejection=opening.find(b=>b.high>high&&b.close<high);
 if(!rejection)continue;
 signals++;
 const idx=bars.findIndex(b=>b.timestampMs===rejection.timestampMs);
 const future=bars.slice(idx+1,idx+31);
 if(future.length!==30||future.some((b,i)=>b.timestampMs!==rejection.timestampMs+(i+1)*60000)){skipped++;console.log("SEQUENCE_SKIP",JSON.stringify({date,ticker,reason:"FUTURE_BARS_MISSING"}));continue;}
 const entry=future[0]!.open,initialStop=Math.max(high,rejection.high)+0.25,risk=initialStop-entry;
 if(risk<=0){skipped++;continue;}
 const nq=(risk+1)*20+40<=250,qty=nq?1:Math.floor(250/((risk+1)*2+4)),dollar=nq?20:2,fee=nq?40:4;
 if(qty<1){skipped++;continue;}
 for(const mode of modes){
  let stop=initialStop,lowest=entry,armed=false,exit=future[29]!.close,reason="TIME",moves=0;
  const issues:string[]=[];
  const events:object[]=[];
  for(let i=0;i<future.length;i++){
   const bar=future[i]!,target=entry-3*risk;
   // A stop adjustment is calculated only from previously completed candles.
   if(mode==="STRUCTURAL_BE30_TRAIL20"&&armed){
    const candidate=entry-10-Math.floor((entry-lowest-30)/10)*10;
    if(candidate<stop){stop=candidate;moves++;events.push({minute:i,event:"RATCHET_BEFORE_BAR",stop});}
   }
   // At the entry candle's open, the entry occurs before intrabar stop/target checks.
   // On later candles, opening gaps have precedence over intrabar extremes.
   if(i>0&&bar.open>=stop){exit=bar.open;reason="STOP_GAP";events.push({minute:i,event:reason,exit});break;}
   if(i>0&&mode==="STRUCTURAL_3R"&&bar.open<=target){exit=bar.open;reason="TARGET_GAP";events.push({minute:i,event:reason,exit});break;}
   if(i===0&&(bar.open>=initialStop||bar.open<=target))issues.push("ENTRY_OPEN_CROSSES_EXIT_LEVEL");
   const stopHit=bar.high>=stop,targetHit=mode==="STRUCTURAL_3R"&&bar.low<=target;
   if(stopHit&&targetHit)issues.push("AMBIGUOUS_BOTH_HIT_STOP_FIRST");
   if(stopHit){exit=stop;reason="STOP";events.push({minute:i,event:reason,exit});break;}
   if(targetHit){exit=target;reason="TARGET";events.push({minute:i,event:reason,exit});break;}
   lowest=Math.min(lowest,bar.low);
   if(mode==="STRUCTURAL_BE30_TRAIL20"&&!armed&&entry-lowest>=30){armed=true;events.push({minute:i,event:"ARM_AFTER_COMPLETED_BAR",favorable:entry-lowest});}
  }
  const net=Number((((entry-exit)*dollar-dollar-fee)*qty).toFixed(2));
  const maxInitialLoss=Number((((risk+1)*dollar+fee)*qty).toFixed(2));
  if(maxInitialLoss>250)issues.push("INITIAL_BUDGET_BREACH");
  results.push({date,ticker,mode,net,reason,entry,exit,qty,maxInitialLoss,issues});
  console.log("SEQUENCE_TRADE",JSON.stringify({date,ticker,mode,entry,initialStop,target:entry-3*risk,exit,reason,qty,net,maxInitialLoss,moves,issues}));
  if(date==="2026-06-10")console.log("SEQUENCE_JUNE10",JSON.stringify({date,ticker,mode,events}));
 }
}
for(const mode of modes){
 const rows=results.filter(x=>x.mode===mode);
 const net=rows.reduce((n,r)=>n+r.net,0);
 console.log("SEQUENCE_SUMMARY",JSON.stringify({mode,trades:rows.length,net:Number(net.toFixed(2)),wins:rows.filter(r=>r.net>0).length,withoutJune10:Number(rows.filter(r=>r.date!=="2026-06-10").reduce((n,r)=>n+r.net,0).toFixed(2)),issues:rows.flatMap(r=>r.issues.map(issue=>({date:r.date,issue})))}));
}
console.log("SEQUENCE_END",JSON.stringify({selectedDates:selections.length,signals,skipped,rollExcluded,incompleteExcluded,originalExcluded,apiCalls:0,writes:0,orders:0,notes:["Independent chronology audit on one-minute OHLC; cannot resolve intrabar path or executable fills","First entry bar uses entry at its open; both-hit ambiguity resolves stop-first","No strategy modification or approval"]}));

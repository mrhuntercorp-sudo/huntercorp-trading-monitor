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
type Trade={date:string;ticker:string;net:number;initialLoss:number;worstOpenPnl:number;qty:number;instrument:string;exitReason:string};
const trades:Trade[]=[];
type RawTrade={date:string;entry:number;exit:number;worstHigh:number;risk:number;exitReason:string};
const raw:RawTrade[]=[];
let eligible=0,signals=0,blocked=0,rollExcluded=0,incomplete=0;
const round=(n:number)=>Number(n.toFixed(2));
console.log("=== TM001 S1 STEPPED COMBINE CHRONOLOGICAL PAPER REPLAY ===");
console.log("RULES",JSON.stringify({startingBalance:50000,profitTarget:3000,eodTrailingMll:2000,personalBestDayCeiling:1500,consistencyRatio:0.5,initialRiskBudget:250,oneTradePerDay:true,steppedExit:"BE at 30 favorable points, ratchet 10-point steps using completed prior bars",riskNote:"$1500 daily ceiling is assessed, not enforced via an invented intrabar exit",apiCalls:0,orders:0}));
for(const date of dates){
 const candidates=tickers.filter(t=>{const day=byContract.get(t)!.get(date);return day&&complete([...day.values()],120,420)&&complete([...day.values()],570,90)&&complete([...day.values()],660,30);});
 let ticker:string|undefined;
 if(date>="2026-09-14"){ticker=candidates.includes("NQZ6")?"NQZ6":undefined;}
 else if(candidates.length===1){ticker=candidates[0];}
 else if(candidates.length>1){rollExcluded++;continue;}
 if(!ticker){incomplete++;continue;}
 const bars=[...byContract.get(ticker)!.get(date)!.values()].sort((a,b)=>a.timestampMs-b.timestampMs);
 eligible++;
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
 const nq=(risk+1)*20+40<=250,instrument=nq?"NQ":"MNQ",dollar=nq?20:2,fee=nq?40:4;
 const qty=nq?1:Math.floor(250/((risk+1)*2+4));
 if(qty<1){blocked++;continue;}
 let stop=initialStop,armed=false,lowest=entry,exit=future[29]!.close,exitReason="TIME",worstHigh=entry;
 for(let i=0;i<future.length;i++){
  const bar=future[i]!;
  if(armed){
   const steps=Math.floor((entry-lowest-30)/10);
   const candidate=entry-10-steps*10;
   if(candidate<stop)stop=candidate;
  }
  if(i>0&&bar.open>=stop){exit=bar.open;exitReason="STOP_GAP";worstHigh=Math.max(worstHigh,bar.open);break;}
  if(bar.high>=stop){exit=stop;exitReason="STOP";worstHigh=Math.max(worstHigh,exit);break;}
  worstHigh=Math.max(worstHigh,bar.high);
  lowest=Math.min(lowest,bar.low);
  if(entry-lowest>=30)armed=true;
 }
 const net=round(((entry-exit-1)*dollar-fee)*qty);
 const worstOpenPnl=round(((entry-worstHigh-1)*dollar-fee)*qty);
 trades.push({date,ticker,net,initialLoss:round(((risk+1)*dollar+fee)*qty),worstOpenPnl,qty,instrument,exitReason});
 raw.push({date,entry,exit,worstHigh,risk,exitReason});
 console.log("COMBINE_TRADE",JSON.stringify(trades[trades.length-1]));
}

const budgets=[250,350,500,750];
for(const budget of budgets){
 const sized=raw.map(t=>{
  const nqUnit=(t.risk+1)*20+40,mnqUnit=(t.risk+1)*2+4;
  const instrument=nqUnit<=budget?"NQ":"MNQ";
  const dollar=instrument==="NQ"?20:2,fee=instrument==="NQ"?40:4;
  const qty=instrument==="NQ"?Math.max(1,Math.floor(budget/nqUnit)):Math.floor(budget/mnqUnit);
  if(qty<1)return {...t,qty:0,instrument,net:0,initialLoss:0,worstOpenPnl:0};
  return {...t,qty,instrument,net:round(((t.entry-t.exit-1)*dollar-fee)*qty),initialLoss:round(((t.risk+1)*dollar+fee)*qty),worstOpenPnl:round(((t.entry-t.worstHigh-1)*dollar-fee)*qty)};
 });
 let balance=50000,threshold=48000,bestDay=0,pass:null|string=null,breach:null|string=null,executed=0,peak=50000,maxClosedDd=0,maxRisk=0,skipped=0,over1500=0;
 for(const t of sized){
  if(pass||breach)break;
  if(t.qty<1){skipped++;continue;}
  const adverse=balance+t.worstOpenPnl;
  if(adverse<=threshold){breach=t.date;break;}
  balance=round(balance+t.net);executed++;maxRisk=Math.max(maxRisk,t.initialLoss);
  peak=Math.max(peak,balance);maxClosedDd=Math.max(maxClosedDd,peak-balance);
  threshold=Math.min(50000,Math.max(threshold,balance-2000));
  bestDay=Math.max(bestDay,t.net);
  if(t.net>1500)over1500++;
  const profit=balance-50000;
  console.log("FAST_DAY",JSON.stringify({budget,date:t.date,instrument:t.instrument,qty:t.qty,net:t.net,initialLoss:t.initialLoss,balance,profit,bestDay,consistency55pct:bestDay<=0.55*profit,overPersonal1500:t.net>1500}));
  if(profit>=3000&&bestDay<=0.55*profit)pass=t.date;
 }
 console.log("FAST_SUMMARY",JSON.stringify({budget,signals:sized.length,executed,skipped,net:round(balance-50000),pass,breach,bestDay,maxInitialRisk:maxRisk,maxClosedDd:round(maxClosedDd),overPersonal1500Days:over1500,withinFiveTradeDays:!!pass&&executed<=5,apiCalls:0,orders:0}));
}
console.log("FAST_CAVEATS",JSON.stringify({notes:["Retrospective sparse dates are not five consecutive trading days","55 percent consistency assumption; verify account-specific rules","Personal $1500 ceiling reported but not enforced","NQ/MNQ sizing based on structural stop and modeled costs","Intraday MLL uses approximate adverse OHLC not tick data","Higher risk budgets are hypothetical only, no orders or API calls"]}));

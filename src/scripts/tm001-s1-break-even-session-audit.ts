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
type ExitName="STEPPED_30_20"|"STEPPED_40_20"|"BE30_GROSS"|"BE30_NET"|"BE40_GROSS"|"BE40_NET";
type Outcome={net:number;reason:string;exitIndex:number};
const names:ExitName[]=["STEPPED_30_20","STEPPED_40_20","BE30_GROSS","BE30_NET","BE40_GROSS","BE40_NET"];
type Raw={date:string;entry:number;initialStop:number;risk:number;future:MinuteBar[]};
const raw:Raw[]=[];
const eligibleDates:string[]=[];
let eligible=0,signals=0,blocked=0,rollExcluded=0,incomplete=0;
const simulate=(t:Raw,dollar:number,fee:number,qty:number,name:ExitName,extraStopSlippage:number):Outcome=>{
 let stop=t.initialStop,lowest=t.entry,armed=false,exit=t.future[29]!.close,exitIndex=29,reason="TIME";
 const activation=name.includes("40")?40:30;
 const isBE=name.startsWith("BE");
 const lock=name==="STEPPED_30_20"?10:20;
 for(let i=0;i<t.future.length;i++){
  const bar=t.future[i]!;
  if(armed){
   const candidate=isBE
    ?t.entry-(name.endsWith("NET")?(1+fee/dollar):0)
    :t.entry-lock-Math.floor((t.entry-lowest-activation)/10)*10;
   stop=Math.min(stop,candidate);
  }
  if(i>0&&bar.open>=stop){exit=bar.open+extraStopSlippage;reason="STOP_GAP";exitIndex=i;break;}
  if(bar.high>=stop){exit=stop+extraStopSlippage;reason="STOP";exitIndex=i;break;}
  lowest=Math.min(lowest,bar.low);
  if(t.entry-lowest>=activation)armed=true;
 }
 return {net:round(((t.entry-exit-1)*dollar-fee)*qty),reason,exitIndex};
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

const weekdays=(date:string)=>{const d=new Date(date+"T12:00:00Z").getUTCDay();return d>=1&&d<=5;};
const dateNext=(date:string)=>new Date(Date.parse(date+"T12:00:00Z")+86400000).toISOString().slice(0,10);
const eligibleSet=new Set(eligibleDates);
const rawByDate=new Map(raw.map(t=>[t.date,t]));
const first=eligibleDates[0],last=eligibleDates[eligibleDates.length-1];
let weekdayCount=0,missingWeekdays=0;
for(let d=first;d<=last;d=dateNext(d)){if(weekdays(d)){weekdayCount++;if(!eligibleSet.has(d))missingWeekdays++;}}
console.log("SESSION_COVERAGE",JSON.stringify({first,last,weekdayCount,completeEligibleSessions:eligibleDates.length,missingOrExcludedWeekdays:missingWeekdays,signalSessions:raw.length,blocked,rollExcluded,incomplete,warning:"Weekdays include market holidays; missing or excluded days cannot be treated as verified no-signal sessions."}));
for(const name of names)for(const extraStopSlippage of [0,4]){
 const budget=250;let balance=50000,threshold=48000,bestDay=0,peak=50000,maxDd=0,pass:null|string=null,breach:null|string=null,executed=0,overCap=0;
 const trades:{date:string;net:number}[]=[];
 for(const t of raw){
  if(pass||breach)break;
  const nqUnit=(t.risk+1)*20+40,mnqUnit=(t.risk+1)*2+4;
  const instrument=nqUnit<=budget?"NQ":"MNQ",dollar=instrument==="NQ"?20:2,fee=instrument==="NQ"?40:4;
  const qty=instrument==="NQ"?Math.floor(budget/nqUnit):Math.floor(budget/mnqUnit);
  if(qty<1)continue;
  const o=simulate(t,dollar,fee,qty,name,extraStopSlippage);
  const worstHigh=Math.max(t.entry,...t.future.slice(0,o.exitIndex).map(b=>b.high));
  const adverse=round(((t.entry-worstHigh-1)*dollar-fee)*qty);
  if(balance+adverse<=threshold){breach=t.date;break;}
  balance=round(balance+o.net);executed++;trades.push({date:t.date,net:o.net});
  peak=Math.max(peak,balance);maxDd=Math.max(maxDd,peak-balance);
  threshold=Math.min(50000,Math.max(threshold,balance-2000));
  bestDay=Math.max(bestDay,o.net);if(o.net>1500)overCap++;
  if(balance>=53000&&bestDay<=0.55*(balance-50000))pass=t.date;
 }
 let qualifyingFiveWindows=0,verifiedFiveWindows=0,unverifiedFiveWindows=0;
 for(let i=0;i+4<eligibleDates.length;i++){
  const window=eligibleDates.slice(i,i+5);
  const calendarWeekdays=[] as string[];
  for(let d=window[0]!;d<=window[4]!;d=dateNext(d))if(weekdays(d))calendarWeekdays.push(d);
  if(calendarWeekdays.length!==5){unverifiedFiveWindows++;continue;}
  verifiedFiveWindows++;
  let pnl=0,localBest=0;
  for(const d of window){const t=rawByDate.get(d);if(!t)continue;
   const nqUnit=(t.risk+1)*20+40,mnqUnit=(t.risk+1)*2+4;
   const nq=nqUnit<=250,dollar=nq?20:2,fee=nq?40:4,qty=nq?Math.floor(250/nqUnit):Math.floor(250/mnqUnit);
   if(qty<1)continue;
   const net=simulate(t,dollar,fee,qty,name,extraStopSlippage).net;
   pnl=round(pnl+net);localBest=Math.max(localBest,net);
  }
  if(pnl>=3000&&localBest<=1500&&localBest<=0.55*pnl)qualifyingFiveWindows++;
 }
 console.log("SESSION_EXIT_SUMMARY",JSON.stringify({name,extraStopSlippage,executed,net:round(balance-50000),pass,breach,bestDay,over1500Days:overCap,maxClosedDd:round(maxDd),verifiedFiveSessionWindows:verifiedFiveWindows,unverifiedFiveSessionWindows:unverifiedFiveWindows,fiveSessionProfitTargetWindows:qualifyingFiveWindows,apiCalls:0,orders:0}));
}
console.log("SESSION_EXIT_CAVEATS",JSON.stringify({notes:["Consecutive windows are counted only when five weekdays each have complete eligible sessions; market holidays may make coverage conservative","Five-session window statistic is a gross standalone restart-at-zero profit and consistency screen, not a full rolling Topstep MLL replay","Gross BE exits at entry lose roundtrip slippage and fees; net BE accounts for modeled base slippage and fees, but adverse fills can still lose","BE stop activates on next bar after completed favorable bar; max 30-minute hold remains","40/20 was selected on these retrospective dates; results not out-of-sample","1-minute OHLC cannot prove exact intrabar MLL or execution","No API calls or orders"]}));

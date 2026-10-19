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


const start="2026-08-20",end="2026-10-09";
const sessions=eligibleDates.filter(d=>d>=start&&d<=end);
if(sessions.length!==37)throw Error("EXPECTED_37_SESSIONS_GOT_"+sessions.length);
const rawByDate=new Map(raw.map(t=>[t.date,t]));
const nextDate=(d:string)=>new Date(Date.parse(d+"T12:00:00Z")+86400000).toISOString().slice(0,10);
const isWeekday=(d:string)=>{const day=new Date(d+"T12:00:00Z").getUTCDay();return day>=1&&day<=5;};
for(let i=1;i<sessions.length;i++){
 let d=nextDate(sessions[i-1]!);while(!isWeekday(d))d=nextDate(d);
 if(d!==sessions[i])throw Error("NONCONTIGUOUS_WEEKDAYS "+sessions[i-1]+" "+sessions[i]);
}
const scenario=(name:ExitName,slippage:number,days:string[],emitDaily:boolean)=>{
 let balance=50000,threshold=48000,peak=50000,bestDay=0,maxClosedDd=0,pass:null|string=null,breach:null|string=null,trades=0,noSignal=0,overCap=0;
 for(let i=0;i<days.length;i++){
  if(pass||breach)break;
  const date=days[i]!,t=rawByDate.get(date);
  if(!t){noSignal++;if(emitDaily)console.log("REPLAY_DAY",JSON.stringify({name,slippage,date,day:i+1,status:"NO_SIGNAL",balance,threshold}));continue;}
  const nqUnit=(t.risk+1)*20+40,mnqUnit=(t.risk+1)*2+4;
  const nq=nqUnit<=250,dollar=nq?20:2,fee=nq?40:4,qty=nq?Math.floor(250/nqUnit):Math.floor(250/mnqUnit);
  if(qty<1){if(emitDaily)console.log("REPLAY_DAY",JSON.stringify({name,slippage,date,day:i+1,status:"SIZE_BLOCKED",balance,threshold}));continue;}
  const o=simulate(t.future,t.entry,t.initialStop,t.risk,dollar,fee,qty,name,slippage);
  const adverse=round(((t.entry-o.worstHigh-1)*dollar-fee)*qty);
  if(balance+adverse<=threshold){breach=date;if(emitDaily)console.log("REPLAY_DAY",JSON.stringify({name,slippage,date,day:i+1,status:"APPROX_MLL_BREACH",balance,threshold,adverse}));break;}
  balance=round(balance+o.net);trades++;peak=Math.max(peak,balance);maxClosedDd=Math.max(maxClosedDd,peak-balance);
  threshold=Math.min(50000,Math.max(threshold,balance-2000));
  bestDay=Math.max(bestDay,o.net);if(o.net>1500)overCap++;
  if(emitDaily)console.log("REPLAY_DAY",JSON.stringify({name,slippage,date,day:i+1,status:"TRADE",net:o.net,balance,threshold,bestDay,overPersonalCap:o.net>1500}));
  if(balance>=53000&&bestDay<=0.55*(balance-50000))pass=date;
 }
 return {name,slippage,sessions:days.length,trades,noSignal,net:round(balance-50000),pass,breach,bestDay,over1500Days:overCap,maxClosedDd:round(maxClosedDd)};
};
console.log("REPLAY_COVERAGE",JSON.stringify({start,end,sessions:sessions.length,signals:sessions.filter(d=>rawByDate.has(d)).length,noSignal:sessions.filter(d=>!rawByDate.has(d)).length,apiCalls:0,orders:0}));
for(const name of names)for(const slippage of [0,4]){
 const result=scenario(name,slippage,sessions,true);
 let windows=0,passed=0,breached=0,closest=-Infinity,fastest:null|number=null;
 for(let length=2;length<=5;length++){
  let count=0,passes=0;
  for(let i=0;i+length<=sessions.length;i++){
   const w=scenario(name,slippage,sessions.slice(i,i+length),false);
   count++;if(w.pass){passes++;passed++;if(fastest===null||length<fastest)fastest=length;}
   if(w.breach)breached++;
   closest=Math.max(closest,w.net);
  }
  windows+=count;
  console.log("REPLAY_WINDOWS",JSON.stringify({name,slippage,length,windows:count,passes}));
 }
 console.log("REPLAY_SUMMARY",JSON.stringify({...result,rollingWindows2to5:windows,rollingPasses:passed,rollingBreaches:breached,maxWindowNet:round(closest),fastestWindowPass:fastest,apiCalls:0,orders:0}));
}
console.log("REPLAY_CAVEATS",JSON.stringify({notes:["37 complete weekday sessions only; exchange holidays and special trading sessions not verified","2-5 session windows restart account at 50000; rolling pass counts printed by length","55 percent consistency assumed; personal 1500 best-day ceiling reported but not enforced","Intrabar MLL uses one-minute OHLC approximation; adverse high may occur before or after stop","Trailing 40/20 remains frozen; retrospective data are not independent validation","Zero API calls, zero orders"]}));

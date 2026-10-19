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
type Audit={date:string;instrument:string;qty:number;initialLoss:number;net:number;worstOpenPnl:number;exitReason:string;stopTouches:number;gapPoints:number;activationBar:number|null;exitBar:number;maxAdversePoints:number;stopMoved:number};
const audits:Audit[]=[];
type Integrity={date:string;qty:number;instrument:string;baseline:number;conservative:number;stopUpdates:number;invalidUpdates:number;gapStops:number;stopBarsWithBothExtremes:number;activationAndStopSameBar:number;exitReason:string};
const integrity:Integrity[]=[];
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
 let activationBar:number|null=null,exitBar=29,stopMoved=0,stopTouches=0,gapPoints=0;
 for(let i=0;i<future.length;i++){
  const bar=future[i]!;
  if(armed){
   const steps=Math.floor((entry-lowest-30)/10);
   const candidate=entry-10-steps*10;
   if(candidate<stop){stop=candidate;stopMoved++;}
  }
  if(i>0&&bar.open>=stop){exit=bar.open;exitReason="STOP_GAP";exitBar=i;gapPoints=round(bar.open-stop);worstHigh=Math.max(worstHigh,bar.open);break;}
  if(bar.high>=stop){exit=stop;exitReason="STOP";exitBar=i;stopTouches++;worstHigh=Math.max(worstHigh,exit);break;}
  worstHigh=Math.max(worstHigh,bar.high);
  lowest=Math.min(lowest,bar.low);
  if(entry-lowest>=30){if(!armed)activationBar=i;armed=true;}
 }
 const net=round(((entry-exit-1)*dollar-fee)*qty);
 const worstOpenPnl=round(((entry-worstHigh-1)*dollar-fee)*qty);
 trades.push({date,ticker,net,initialLoss:round(((risk+1)*dollar+fee)*qty),worstOpenPnl,qty,instrument,exitReason});
 audits.push({date,instrument,qty,initialLoss:round(((risk+1)*dollar+fee)*qty),net,worstOpenPnl,exitReason,stopTouches,gapPoints,activationBar,exitBar,maxAdversePoints:round(Math.max(0,worstHigh-entry)),stopMoved});
 console.log("COMBINE_TRADE",JSON.stringify(trades[trades.length-1]));

 // Independent second execution replay: stop updates use only completed prior candles.
 // Worst-case additional fill assumption: every stop exit incurs 4 NQ points
 // beyond the modeled baseline, while time exits retain the baseline fill.
 let conservativeStop=initialStop,priorLow=entry,priorArmed=false;
 let conservativeExit=future[29]!.close,conservativeReason="TIME";
 let stopUpdates=0,invalidUpdates=0,gapStops=0,stopBarsWithBothExtremes=0,activationAndStopSameBar=0;
 for(let j=0;j<future.length;j++){
  const bar=future[j]!;
  const oldStop=conservativeStop;
  if(priorArmed){
   const steps=Math.floor((entry-priorLow-30)/10);
   const candidate=entry-10-steps*10;
   if(candidate<conservativeStop){conservativeStop=candidate;stopUpdates++;}
  }
  if(conservativeStop>oldStop)invalidUpdates++;
  const crossed=bar.high>=conservativeStop;
  const gap=j>0&&bar.open>=conservativeStop;
  if(crossed){
   if(bar.low<=conservativeStop)stopBarsWithBothExtremes++;
   if(!priorArmed&&entry-bar.low>=30)activationAndStopSameBar++;
   conservativeExit=gap?bar.open:conservativeStop;
   conservativeReason=gap?"STOP_GAP":"STOP";
   if(gap)gapStops++;
   break;
  }
  priorLow=Math.min(priorLow,bar.low);
  if(entry-priorLow>=30)priorArmed=true;
 }
 if(conservativeReason!==exitReason||Math.abs(conservativeExit-exit)>1e-9||stopUpdates!==stopMoved){
  throw Error("EXECUTION_REPLAY_MISMATCH "+date+" "+JSON.stringify({conservativeReason,exitReason,conservativeExit,exit,stopUpdates,stopMoved}));
 }
 const extraStopSlip=conservativeReason==="TIME"?0:4;
 const conservativeNet=round(((entry-conservativeExit-1-extraStopSlip)*dollar-fee)*qty);
 integrity.push({date,qty,instrument,baseline:net,conservative:conservativeNet,stopUpdates,invalidUpdates,gapStops,stopBarsWithBothExtremes,activationAndStopSameBar,exitReason});
 
}


const round2=(n:number)=>Number(n.toFixed(2));
const first17=integrity.slice(0,17);
for(const t of first17)console.log("INTEGRITY_TRADE",JSON.stringify(t));
for(const scenario of ["BASELINE","CONSERVATIVE_4_POINT_STOP_FILL"] as const){
 let balance=50000,threshold=48000,bestDay=0,pass:null|string=null,breach:null|string=null,executed=0,peak=50000,maxClosedDd=0;
 for(const t of integrity){
  if(pass||breach)break;
  const net=scenario==="BASELINE"?t.baseline:t.conservative;
  // This is a closed-trade comparison, not an intrabar liquidation test.
  balance=round2(balance+net);
  executed++;
  peak=Math.max(peak,balance);maxClosedDd=Math.max(maxClosedDd,peak-balance);
  if(balance<=threshold){breach=t.date;break;}
  threshold=Math.min(50000,Math.max(threshold,balance-2000));
  bestDay=Math.max(bestDay,net);
  if(balance>=53000&&bestDay<=0.5*(balance-50000)&&bestDay<=1500)pass=t.date;
 }
 console.log("INTEGRITY_SCENARIO",JSON.stringify({scenario,executed,net:round2(balance-50000),pass,breach,maxClosedDd:round2(maxClosedDd),bestDay:round2(bestDay)}));
}
console.log("INTEGRITY_SUMMARY",JSON.stringify({trades:integrity.length,first17: first17.length,independentReplayMatched:true,invalidStopUpdates:integrity.reduce((n,t)=>n+t.invalidUpdates,0),stopBarsWithBothExtremes:integrity.reduce((n,t)=>n+t.stopBarsWithBothExtremes,0),activationAndStopSameBar:integrity.reduce((n,t)=>n+t.activationAndStopSameBar,0),gapStops:integrity.reduce((n,t)=>n+t.gapStops,0),baselineFirst17:round2(first17.reduce((n,t)=>n+t.baseline,0)),conservativeFirst17:round2(first17.reduce((n,t)=>n+t.conservative,0)),apiCalls:0,orders:0,caveats:["Independent replay shares the same 1-minute bars and does not validate true fill sequence","A bar with both stop and low extremes is not proof of adverse ordering; stop is checked before low","4-point extra stop fill is hypothetical, not market-derived","Closed-trade scenario cannot establish intrabar Maximum Loss Limit compliance","Retrospective sparse cohort; no forward edge demonstrated"]}));

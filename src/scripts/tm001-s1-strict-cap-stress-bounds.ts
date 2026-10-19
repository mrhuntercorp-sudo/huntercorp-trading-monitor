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


type Candidate={date:string;strategy:"TREND"|"ORB";direction:"LONG"|"SHORT";entry:number;stop:number;exit:number;entryMs:number;exitMs:number;grossPoints:number;net:number;qty:number;instrument:"NQ"|"MNQ";riskBudget:number;ambiguous:boolean};
const eligibleSet=new Set(sessions);
const candidates:Candidate[]=[];
const excluded:{date:string;reason:string}[]=[];
const min=(b:MinuteBar)=>clock(b).m;
const cost=(riskPoints:number)=>{const nq=(riskPoints+1)*20+40,mnq=(riskPoints+1)*2+4;const useNq=nq<=250;const qty=useNq?Math.floor(250/nq):Math.min(7,Math.floor(250/mnq));return {instrument:useNq?"NQ" as const:"MNQ" as const,qty,dollar:useNq?20:2,fee:useNq?40:4};};
for(const date of sessions){
 const ticker=date>="2026-09-14"?"NQZ6":tickers.find(t=>{const day=byContract.get(t)!.get(date);return day&&complete([...day.values()],120,420)&&complete([...day.values()],570,90)&&complete([...day.values()],660,30);});
 if(!ticker){excluded.push({date,reason:"CONTRACT_NOT_RESOLVED"});continue;}
 const day=byContract.get(ticker)!.get(date)!;
 const rth=Array.from({length:390},(_,i)=>day.get(570+i));
 if(rth.some(b=>!b)){excluded.push({date,reason:"INCOMPLETE_FULL_RTH"});continue;}
 const bars=rth as MinuteBar[];
 const trend=generateP4Signals({bars,contractVerified:true,calendarVerified:true},"SESSION_TREND_PULLBACK_V1",10).filter(x=>min({timestampMs:x.entryTime} as MinuteBar)<660);
 if(trend.length){
  const t=trend[0]!,entryIndex=bars.findIndex(b=>b.timestampMs===t.entryTime),sign=t.direction==="LONG"?1:-1;
  let exit=t.entryPrice,exitMs=t.entryTime,ambiguous=false;
  for(let j=entryIndex;j<bars.length;j++){
   const b=bars[j]!;
   if(b.timestampMs>=t.timeExitMs){exit=b.open;exitMs=b.timestampMs;break;}
   const hitStop=sign===1?b.low<=t.stopPrice:b.high>=t.stopPrice,hitTarget=sign===1?b.high>=t.targetPrice:b.low<=t.targetPrice;
   if(hitStop){exit=sign===1?Math.min(t.stopPrice,b.open):Math.max(t.stopPrice,b.open);exitMs=b.timestampMs;ambiguous=hitTarget;break;}
   if(hitTarget){exit=t.targetPrice;exitMs=b.timestampMs;break;}
   if(j===bars.length-1){exit=b.close;exitMs=b.timestampMs;}
  }
  const sizing=cost(10);
  if(sizing.qty>0)candidates.push({date,strategy:"TREND",direction:t.direction,entry:t.entryPrice,stop:t.stopPrice,exit,entryMs:t.entryTime,exitMs,grossPoints:round((exit-t.entryPrice)*sign),net:round(((exit-t.entryPrice)*sign-1)*sizing.dollar*sizing.qty-sizing.fee*sizing.qty),qty:sizing.qty,instrument:sizing.instrument,riskBudget:round(((10+1)*sizing.dollar+sizing.fee)*sizing.qty),ambiguous});
 }
 const high=Math.max(...bars.slice(0,5).map(b=>b.high)),low=Math.min(...bars.slice(0,5).map(b=>b.low));
 const triggerIndex=bars.findIndex((b,i)=>i>=5&&(b.close>high||b.close<low));
 if(triggerIndex>=0&&triggerIndex+1<bars.length){
  const trigger=bars[triggerIndex]!,entryBar=bars[triggerIndex+1]!,direction=trigger.close>high?"LONG" as const:"SHORT" as const;
  if(min(entryBar)<660){
   const sign=direction==="LONG"?1:-1,entry=entryBar.open,stop=entry-sign*40,target=entry+sign*80;
   let exit=bars.at(-1)!.close,exitMs=bars.at(-1)!.timestampMs,ambiguous=false;
   for(let j=triggerIndex+1;j<bars.length;j++){
    const b=bars[j]!,stopHit=sign===1?b.low<=stop:b.high>=stop,targetHit=sign===1?b.high>=target:b.low<=target;
    if(stopHit){exit=sign===1?Math.min(stop,b.open):Math.max(stop,b.open);exitMs=b.timestampMs;ambiguous=targetHit;break;}
    if(targetHit){exit=target;exitMs=b.timestampMs;break;}
   }
   const sizing=cost(40);
   if(sizing.qty>0)candidates.push({date,strategy:"ORB",direction,entry,stop,exit,entryMs:entryBar.timestampMs,exitMs,grossPoints:round((exit-entry)*sign),net:round(((exit-entry)*sign-1)*sizing.dollar*sizing.qty-sizing.fee*sizing.qty),qty:sizing.qty,instrument:sizing.instrument,riskBudget:round(((40+1)*sizing.dollar+sizing.fee)*sizing.qty),ambiguous});
  }
 }
}
const s1Dates=new Set(raw.filter(t=>eligibleSet.has(t.date)).map(t=>t.date));

type PortfolioTrade={date:string;strategy:"S1"|"TREND"|"ORB";entryMs:number;exitMs:number;net:number;worstUnrealized:number;initialRisk:number};
const s1Trades:PortfolioTrade[]=[];
for(const t of raw.filter(x=>eligibleSet.has(x.date))){
 const nqUnit=(t.risk+1)*20+40,mnqUnit=(t.risk+1)*2+4;
 const nq=nqUnit<=250,dollar=nq?20:2,fee=nq?40:4,qty=nq?Math.floor(250/nqUnit):Math.min(7,Math.floor(250/mnqUnit));
 if(qty<1)continue;
 const o=simulate(t.future,t.entry,t.initialStop,t.risk,dollar,fee,qty,"STEPPED_40_20",0);
 const first=t.future[0]!,last=t.future[o.exitIndex]!;
 s1Trades.push({date:t.date,strategy:"S1",entryMs:first.timestampMs,exitMs:last.timestampMs,net:o.net,worstUnrealized:round(((t.entry-o.worstHigh-1)*dollar-fee)*qty),initialRisk:round((nq?nqUnit:mnqUnit)*qty)});
}
const allTrades:PortfolioTrade[]=[...s1Trades,...candidates.map(c=>({date:c.date,strategy:c.strategy,entryMs:c.entryMs,exitMs:c.exitMs,net:c.net,worstUnrealized:round(-c.riskBudget),initialRisk:c.riskBudget}))];
const overlap=(a:PortfolioTrade,b:PortfolioTrade)=>a.entryMs<=b.exitMs&&b.entryMs<=a.exitMs;
const makeDay=(date:string,mode:"S1"|"TREND"|"ORB")=>{
 const available=allTrades.filter(t=>t.date===date&&(t.strategy==="S1"||t.strategy===mode)).sort((a,b)=>a.entryMs-b.entryMs||(a.strategy==="S1"?-1:1));
 const accepted:PortfolioTrade[]=[],skipped:PortfolioTrade[]=[];
 for(const t of available){if(accepted.some(x=>overlap(x,t))){skipped.push(t);continue;}accepted.push(t);}
 return {accepted,skipped};
};
const replay=(days:string[],mode:"S1"|"TREND"|"ORB",verbose:boolean)=>{
 let balance=50000,threshold=48000,peak=50000,maxClosedDd=0,bestDay=0,pass:null|string=null,breach:null|string=null,capViolations=0,accepted=0,skipped=0,overlapSkippedS1=0;
 for(let i=0;i<days.length;i++){
  const date=days[i]!,day=makeDay(date,mode);skipped+=day.skipped.length;overlapSkippedS1+=day.skipped.filter(x=>x.strategy==="S1").length;
  const executed:PortfolioTrade[]=[];
  let dayNet=0;
  for(const t of day.accepted){
   if(balance+t.worstUnrealized<=threshold){breach=date;break;}
   balance=round(balance+t.net);dayNet=round(dayNet+t.net);accepted++;executed.push(t);
   peak=Math.max(peak,balance);maxClosedDd=Math.max(maxClosedDd,peak-balance);
   threshold=Math.min(50000,Math.max(threshold,balance-2000));
  }
  if(breach)break;
  if(dayNet>1500)capViolations++;
  bestDay=Math.max(bestDay,dayNet);
  if(verbose)console.log("PORTFOLIO_DAY",JSON.stringify({mode,date,day:i+1,net:dayNet,balance,threshold,accepted:executed.map(t=>t.strategy),skipped:day.skipped.map(t=>t.strategy),overPersonalCap:dayNet>1500}));
  if(balance>=53000&&bestDay<=0.55*(balance-50000)){pass=date;break;}
 }
 return {mode,sessions:days.length,net:round(balance-50000),pass,breach,bestDay,capViolations,accepted,skipped,overlapSkippedS1,maxClosedDd:round(maxClosedDd)};
};

/**
 * STRICT BOUNDING AUDIT. Accounting-level clipping is an optimistic upper bound,
 * NOT an executable profit-target fill. Intrabar order of OHLC is unknown.
 */
const strictTrades=allTrades.map(t=>{
 const c=t.strategy==="S1"?rawByDate.get(t.date):candidates.find(x=>x.date===t.date&&x.strategy===t.strategy);
 if(!c)throw Error("MISSING_TRADE_SOURCE "+t.date);
 let qty:number,dollar:number;
 if(t.strategy==="S1"){
  const r=(c as (typeof raw)[number]).risk;
  const nq=(r+1)*20+40<=250;dollar=nq?20:2;
  qty=nq?Math.floor(250/((r+1)*20+40)):Math.min(7,Math.floor(250/((r+1)*2+4)));
 }else{const v=c as Candidate;qty=v.qty;dollar=v.instrument==="NQ"?20:2;}
 return {...t,stressPerPoint:qty*dollar};
});
type StrictMode="S1"|"TREND"|"ORB";
const strictDay=(date:string,mode:StrictMode)=>{
 const a=strictTrades.filter(t=>t.date===date&&(t.strategy==="S1"||t.strategy===mode))
 .sort((x,y)=>x.entryMs-y.entryMs||(x.strategy==="S1"?-1:1));
 const selected:typeof a=[],skipped:typeof a=[];
 for(const t of a){if(selected.some(x=>overlap(x,t)))skipped.push(t);else selected.push(t);}
 return {selected,skipped};
};
function strictReplay(days:string[],mode:StrictMode,adversePoints:number){
 let balance=50000,threshold=48000,peak=50000,pass:null|string=null,breach:null|string=null,bestDay=0,maxClosedDd=0,accepted=0,skipped=0,clipped=0,capBreaches=0;
 let s1Blocked=0;
 for(const date of days){
  const {selected,skipped:rejected}=strictDay(date,mode);
  skipped+=rejected.length;s1Blocked+=rejected.filter(x=>x.strategy==="S1").length;
  let dayNet=0;
  for(const t of selected){
   const stressedNet=round(t.net-adversePoints*t.stressPerPoint);
   const stressedAdverse=round(t.worstUnrealized-adversePoints*t.stressPerPoint);
   if(balance+stressedAdverse<=threshold){breach=date;break;}
   // Upper bound: assumes instant profit-taking at remaining daily ceiling.
   // Never interpret clipped PnL as a fill or an actual executable strategy.
   const room=1500-dayNet;
   if(room<=0)break;
   const booked=Math.min(stressedNet,room);
   if(booked<stressedNet)clipped++;
   dayNet=round(dayNet+booked);balance=round(balance+booked);accepted++;
   peak=Math.max(peak,balance);maxClosedDd=Math.max(maxClosedDd,peak-balance);
   threshold=Math.min(50000,Math.max(threshold,balance-2000));
  }
  if(breach)break;
  bestDay=Math.max(bestDay,dayNet);
  if(dayNet>1500+1e-7)capBreaches++;
  if(balance>=53000&&bestDay<=.55*(balance-50000)){pass=date;break;}
 }
 return {mode,adversePoints,sessions:days.length,net:round(balance-50000),pass,breach,bestDay,capBreaches,optimisticallyClippedTrades:clipped,accepted,skipped,s1Blocked,maxClosedDd:round(maxClosedDd)};
}
console.log("STRICT_COVERAGE",JSON.stringify({sessions:sessions.length,s1:s1Trades.length,trend:candidates.filter(x=>x.strategy==="TREND").length,orb:candidates.filter(x=>x.strategy==="ORB").length,excluded,apiCalls:0,orders:0}));
for(const mode of ["S1","TREND","ORB"] as const){
 for(const adversePoints of [0,4]){
  console.log("STRICT_FULL",JSON.stringify(strictReplay(sessions,mode,adversePoints)));
  for(const horizon of [10,15,20]){
   let passes=0,breaches=0,clippedWindows=0,best=-Infinity,worst=Infinity;
   const windows=sessions.length-horizon+1;
   for(let i=0;i<windows;i++){
    const r=strictReplay(sessions.slice(i,i+horizon),mode,adversePoints);
    if(r.pass)passes++;if(r.breach)breaches++;if(r.optimisticallyClippedTrades)clippedWindows++;
    best=Math.max(best,r.net);worst=Math.min(worst,r.net);
   }
   console.log("STRICT_HORIZON",JSON.stringify({mode,adversePoints,horizon,windows,optimisticPasses:passes,breaches,windowsWithSyntheticProfitClipping:clippedWindows,bestNet:round(best),worstNet:round(worst)}));
  }
 }
}
console.log("STRICT_LIMITATIONS",JSON.stringify({critical:"NOT AN EXECUTABLE CAP-ENFORCED BACKTEST. Profit above $1500 is clipped in accounting only, an optimistic upper bound; a real intrabar profit-target exit must be implemented before claiming compliant passes.",stress:"Adverse 4 points deducted from every completed trade, intentionally pessimistic versus stop-only stress; worst excursion stressed equally.",drawdown:"Approximate 1m OHLC trade-level excursion and closed-trade trailing threshold, not tick-by-tick high-water mark.",independence:"37 in-sample sessions, overlapping windows, no out-of-sample validation.",s1:"40/20 unchanged",apiCalls:0,orders:0}));

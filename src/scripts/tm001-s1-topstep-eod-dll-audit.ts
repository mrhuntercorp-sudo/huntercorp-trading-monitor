/** TM001 S1 London High Sweep: cached-only BE30_TRAIL20 sizing sensitivity, NO live execution. */
import {createHash} from "node:crypto";
import {readdir,readFile} from "node:fs/promises";
import {join} from "node:path";
import {newYorkClock} from "../market/time.js";
import type {MinuteBar} from "../market/types.js";
type Cache={schema:number;provider:string;ticker:string;productCode:string;utcDate:string;sha256:string;bars:MinuteBar[]};
const dir=join("data/cache/massive/NQ/NQZ6"),all=new Map<string,Map<number,MinuteBar>>();
const minute=(b:MinuteBar)=>{const t=newYorkClock(b.timestampMs);return t.hour*60+t.minute;};
const round=(n:number)=>Number(n.toFixed(2));
for(const file of (await readdir(dir)).filter(f=>/^\d{4}-\d\d-\d\d(\.research)?\.json$/.test(f))){
 const c=JSON.parse(await readFile(join(dir,file),"utf8")) as Cache;
 if(c.schema!==1||c.provider!=="massive"||c.ticker!=="NQZ6"||c.productCode!=="NQ"||!file.startsWith(c.utcDate+".")||!Array.isArray(c.bars)||createHash("sha256").update(JSON.stringify(c.bars)).digest("hex")!==c.sha256)throw Error("INVALID_CACHE "+file);
 for(const b of c.bars){
  if(b.contractTicker!=="NQZ6"||b.productCode!=="NQ"||!Number.isSafeInteger(b.timestampMs)||b.timestampMs%60000!==0||![b.open,b.high,b.low,b.close,b.volume].every(Number.isFinite)||b.low>Math.min(b.open,b.close)||b.high<Math.max(b.open,b.close))throw Error("INVALID_BAR "+file);
  const date=newYorkClock(b.timestampMs).date;
  if(!all.has(date))all.set(date,new Map());
  const m=all.get(date)!,old=m.get(b.timestampMs);
  if(old&&JSON.stringify(old)!==JSON.stringify(b))throw Error("CONFLICTING_BAR "+date);
  m.set(b.timestampMs,b);
 }
}
type Trade={date:string;net:number;instrument:string;qty:number;initialLoss:number;worstOpenPnl:number};
const budgets=[250,500,750,1000] as const,ledger=new Map<number,Trade[]>(budgets.map(x=>[x,[]]));
let eligible=0,signals=0,blocked=0;
console.log("=== TM001 S1 TOPSTEP EOD AND OPTIONAL DLL REPLAY ===");
console.log("RULES",JSON.stringify({london:"02:00-08:59 ET complete 420 minutes",signal:"First 09:30-10:59 ET candle high above London high and close below London high",side:"SHORT",entry:"Following 1-minute bar open",stop:"max(London high, rejection candle high)+0.25",exit:"At 30 points favorable move activate breakeven stop; then trail lowest observed low +20 points; 30 bars maximum; conservative OHLC ordering",size:"Prefer 2 NQ, then 1 NQ, then integer MNQ under all-in budget",slippagePoints:1,nqRoundtripFees:40,mnqRoundtripFees:4,drawdown:"Topstep 50K EOD trailing $2000 threshold, optional $1000 DLL, approximate intratrade OHLC",apiCalls:0,orders:0,optimization:false}));
for(const date of [...all.keys()].sort()){
 const mins=new Map([...all.get(date)!.values()].map(b=>[minute(b),b]));
 const london=Array.from({length:420},(_,i)=>mins.get(120+i));
 if(london.some(x=>!x))continue;
 eligible++;
 const londonHigh=Math.max(...(london as MinuteBar[]).map(b=>b.high));
 const rejection=Array.from({length:90},(_,i)=>mins.get(570+i)).find(b=>b&&b.high>londonHigh&&b.close<londonHigh);
 if(!rejection)continue;
 signals++;
 const entryMinute=minute(rejection)+1,entryBar=mins.get(entryMinute);
 if(!entryBar){blocked++;console.log("S1_DAY",JSON.stringify({date,status:"BLOCKED_ENTRY"}));continue;}
 const entry=entryBar.open,stop=Math.max(londonHigh,rejection.high)+0.25,risk=stop-entry;
 if(risk<=0){blocked++;console.log("S1_DAY",JSON.stringify({date,status:"BLOCKED_NONPOSITIVE_RISK",entry,stop}));continue;}
 let exit:null|{price:number;reason:string}=null;
 let active=false,trailStop=stop,lowest=entry,worstPrice=entry;
 for(let m=entryMinute;m<entryMinute+30;m++){
  const b=mins.get(m);
  if(!b)break;
  // The stop effective at the beginning of this minute is tested BEFORE using
  // this minute's low to activate or ratchet the trailing stop. This avoids
  // claiming an unknowable favorable intrabar sequence.
  if(b.high>=trailStop){exit={price:Math.max(trailStop,b.open),reason:active?"TRAIL_STOP":"INITIAL_STOP"};worstPrice=Math.max(worstPrice,exit.price);break;}
  worstPrice=Math.max(worstPrice,b.high);
  lowest=Math.min(lowest,b.low);
  if(!active&&lowest<=entry-30){active=true;trailStop=Math.min(stop,entry);}
  if(active)trailStop=Math.min(trailStop,lowest+20);
  if(m===entryMinute+29)exit={price:b.close,reason:"TIME"};
 }
 if(!exit){blocked++;console.log("S1_DAY",JSON.stringify({date,status:"BLOCKED_EXIT_DATA"}));continue;}
 for(const budget of budgets){
  const nqUnitLoss=(risk+1)*20+40,mnqUnitLoss=(risk+1)*2+4;
  const instrument=nqUnitLoss*2<=budget||nqUnitLoss<=budget?"NQ":"MNQ";
  const qty=instrument==="NQ"?(nqUnitLoss*2<=budget?2:1):Math.floor(budget/mnqUnitLoss);
  if(qty<1){console.log("S1_TRAIL_TRADE",JSON.stringify({date,budget,status:"SKIPPED_RISK",risk:round(risk)}));continue;}
  const pointValue=instrument==="NQ"?20:2,fee=instrument==="NQ"?40:4;
  const net=round(((entry-exit.price)-1)*pointValue*qty-fee*qty);
  const initialLoss=round(((risk+1)*pointValue+fee)*qty);
  const worstOpenPnl=round(((entry-worstPrice)-1)*pointValue*qty-fee*qty);
  ledger.get(budget)!.push({date,net,instrument,qty,initialLoss,worstOpenPnl});
  console.log("S1_EOD_TRADE",JSON.stringify({date,budget,status:"MODELED",entry,stop,riskPoints:round(risk),instrument,qty,initialLoss,worstOpenPnl,exitReason:exit.reason,exitPrice:exit.price,netUsd:net}));
 }
}
// EOD trailing threshold starts $48k, increases only with qualifying closing
// balances and caps at $50k. The live threshold is checked against modeled
// worst intratrade equity. DLL is a session pause, not a failed account.
for(const budget of budgets){
 for(const dllEnabled of [false,true]){
  const trades=ledger.get(budget)!;
  let balance=50000,threshold=48000,executed=0,skipped=0,dllStops=0,firstMllBreach:null|string=null,firstDllHit:null|string=null;
  let largestThresholdGap=0;
  for(const t of trades){
   if(firstMllBreach){skipped++;continue;}
   const sessionStart=balance;
   const adverseEquity=sessionStart+t.worstOpenPnl;
   const mllHit=adverseEquity<=threshold;
   const dllHit=dllEnabled&&adverseEquity<=sessionStart-1000;
   if(mllHit&&!firstMllBreach)firstMllBreach=t.date;
   if(dllHit){dllStops++;if(!firstDllHit)firstDllHit=t.date;}
   // Conservative stop-the-replay at the FIRST threshold touch: the exact
   // liquidation fill is not available from one-minute OHLC data.
   if(mllHit||dllHit){
    console.log("S1_EOD_EVENT",JSON.stringify({date:t.date,budget,dllEnabled,event:mllHit?"MLL_BREACH":"DLL_SESSION_LOCK",balanceBefore:balance,threshold,worstObservedEquity:round(adverseEquity),exactLiquidationPnlUnknown:true}));
    if(mllHit)break;
    continue;
   }
   balance=round(balance+t.net);
   executed++;
   largestThresholdGap=Math.max(largestThresholdGap,round(balance-threshold));
   threshold=Math.min(50000,Math.max(threshold,balance-2000));
  }
  console.log("S1_EOD_SCENARIO",JSON.stringify({budget,dllEnabled,signals:trades.length,completedTrades:executed,skippedAfterBreach:skipped,dllSessionLocks:dllStops,firstDllHit,firstMllBreach,closedBalanceExcludingUnknownLiquidation:balance,threshold,modeledProfitExcludingUnknownLiquidation:round(balance-50000),largestClosingBalanceAboveThreshold:largestThresholdGap,oneMinuteWorstCaseApproximation:true,exactIntrabarOrderUnknown:true,otherTradingAndFeesNotModeled:true,apiCalls:0,orders:0}));
 }
}
console.log("S1_EOD_AUDIT_END",JSON.stringify({eligible,signals,blocked,apiCalls:0,orders:0}));

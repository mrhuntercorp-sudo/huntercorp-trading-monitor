import { CachedHistoricalDays } from "../research/historical-cache.js";
import { backtestConservativeOrb } from "../research/conservative-orb.js";
import { auditRthCoverage } from "../research/rth-coverage.js";
import { overnightBars } from "../research/session-features.js";
import { newYorkClock } from "../market/time.js";
import { provisionalClosedDates, provisionalNqContract, isProvisionalRoll } from "./massive-nq-calendar-policy.js";
import type { MinuteBar } from "../market/types.js";

console.log("=== TM001 MULTI-SETUP EOD SURVIVAL SCREEN ===");
console.log("CACHE ONLY | ZERO API | ZERO WRITES | ZERO TRADES | RESEARCH PROXY");
const cache=new CachedHistoricalDays({async getContractMinuteBars(){throw Error("NETWORK_DISABLED");}});
const ms=(s:string)=>Date.parse(s+"T00:00:00Z"),iso=(t:number)=>new Date(t).toISOString().slice(0,10),dayMs=86400000;
const dates:string[]=[];for(let t=ms("2026-10-02");dates.length<30;t-=dayMs){const d=iso(t),w=new Date(t).getUTCDay();if(w!==0&&w!==6&&!provisionalClosedDates.has(d))dates.push(d);}dates.reverse();
const loaded=new Map<string,MinuteBar[]>();
async function load(ticker:string,date:string){const k=ticker+":"+date;if(!loaded.has(k))loaded.set(k,await cache.getDay({ticker,productCode:"NQ"},date));return loaded.get(k)!;}
const selected:MinuteBar[]=[],excluded:{date:string;reason:string}[]=[];
for(const date of dates){
 const ticker=provisionalNqContract(date),prior=iso(ms(date)-dayMs);
 const bars=[...await load(ticker,prior),...await load(ticker,date)].sort((a,b)=>a.timestampMs-b.timestampMs);
 if(new Set(bars.map(b=>b.timestampMs)).size!==bars.length){excluded.push({date,reason:"DUPLICATE_TIMESTAMPS"});continue;}
 const rth=bars.filter(b=>{const c=newYorkClock(b.timestampMs),m=c.hour*60+c.minute;return c.date===date&&m>=570&&m<960;});
 const overnight=overnightBars(bars,date);
 if(isProvisionalRoll(date)){excluded.push({date,reason:"ROLLOVER_UNVERIFIED"});continue;}
 if(auditRthCoverage(rth,date,ticker).status!=="COMPLETE"){excluded.push({date,reason:"INCOMPLETE_RTH"});continue;}
 if(overnight.length!==930||overnight.some((b,i)=>i>0&&b.timestampMs-overnight[i-1]!.timestampMs!==60000)){excluded.push({date,reason:"INCOMPLETE_OVERNIGHT"});continue;}
 selected.push(...rth);
}
const byDate=new Map<string,MinuteBar[]>();for(const b of selected){const d=newYorkClock(b.timestampMs).date;const arr=byDate.get(d)??[];arr.push(b);byDate.set(d,arr);}
console.log("ELIGIBILITY "+JSON.stringify({candidateDates:dates.length,eligibleSessions:byDate.size,excluded,provisionalCalendarAndRoll:true}));
console.log("RULE_ASSUMPTIONS "+JSON.stringify({startingBalanceUsd:50000,startingBalanceArbitrary:true,combineMllUsd:[2000,3000],mllTrailsEodBalance:true,mllFloorStopsAtStartingBalance:true,intradayUnrealizedEquityChecks:true,minuteBarWorstExtreme:true,commissionMnqRoundTripPerContractUsd:2,slippageTicksPerSide:3,dailyStopBudgetFractionOfMll:0.15,operatingDrawdownFractionOfMll:0.5,source:"NQ minute bars as MNQ price-path proxy",limitations:"minute-bar intrabar ordering unknown; extreme checked conservatively even on exit bar; no true orderbook/fills; account-specific Topstep rules unverified; profit target/consistency not modeled"}));
for(const [stopPoints,targetPoints] of [[20,40],[20,60],[40,40],[40,120]] as const){
 const r=backtestConservativeOrb(selected,{openingRangeMinutes:5,stopPoints,targetPoints,contracts:1,friction:{roundTripCommissionUsd:0,slippageTicksPerSide:0}});
 if(r.excluded.length)throw Error("MODEL_EXCLUSIONS "+JSON.stringify(r.excluded));
 const trades=[...r.trades].sort((a,b)=>a.date.localeCompare(b.date));
 for(const contractsMnq of [1,2,3,5]){
  for(const mll of [2000,3000]){
   const start=50000,fee=5*contractsMnq,pointValue=2*contractsMnq;
   let balance=start,highestEod=start,breachedAt:string|null=null,operatingStopAt:string|null=null,dailyStopCount=0,executed=0,skipped=0,minCushion=mll;
   const dayLossBudget=mll*0.15,operatingBudget=mll*0.5;
   for(const t of trades){
    if(breachedAt!==null||operatingStopAt!==null){skipped++;continue;}
    const floor=Math.min(start,highestEod-mll);
    const bars=byDate.get(t.date)!;
    const startIndex=bars.findIndex(b=>b.timestampMs===t.entryTimestampMs);
    if(startIndex<0)throw Error("ENTRY_BAR_MISSING "+t.date);
    const stop=t.direction==="LONG"?t.entry-stopPoints:t.entry+stopPoints;
    const target=t.direction==="LONG"?t.entry+targetPoints:t.entry-targetPoints;
    let adverse=0,exitSeen=false;
    for(const b of bars.slice(startIndex)){
     const stopHit=t.direction==="LONG"?b.low<=stop:b.high>=stop;
     const targetHit=t.direction==="LONG"?b.high>=target:b.low<=target;
     const worst=t.direction==="LONG"?b.low:b.high;
     const unrealized=(worst-t.entry)*(t.direction==="LONG"?1:-1)*pointValue-fee;
     adverse=Math.min(adverse,unrealized);
     minCushion=Math.min(minCushion,balance+unrealized-floor);
     if(balance+unrealized<=floor&&breachedAt===null)breachedAt=t.date;
     if(stopHit||targetHit){exitSeen=true;break;}
    }
    if(!exitSeen&&t.exitReason!=="SESSION_END")throw Error("EXIT_RECONCILIATION "+t.date);
    const realized=(t.exit-t.entry)*(t.direction==="LONG"?1:-1)*pointValue-fee;
    executed++;
    if(adverse<=-dayLossBudget)dailyStopCount++;
    balance+=realized;
    highestEod=Math.max(highestEod,balance);
    if(start-balance>=operatingBudget&&operatingStopAt===null)operatingStopAt=t.date;
   }
   console.log("SCENARIO "+JSON.stringify({stopPoints,targetPoints,contractsMnq,mllUsd:mll,operatingBudgetUsd:operatingBudget,dailyLossBudgetUsd:dayLossBudget,executedTrades:executed,skippedTrades:skipped,simulatedNetUsd:Number((balance-start).toFixed(2)),mllFirstTouchDate:breachedAt,operatingStopDate:operatingStopAt,daysExceedingDailyBudget:dailyStopCount,minimumIntradayCushionUsd:Number(minCushion.toFixed(2)),status:breachedAt?"MLL_TOUCH":operatingStopAt?"OPERATING_STOP":"NO_TOUCH_IN_SAMPLE"}));
  }
 }
}
console.log("TM001 COMBINE RESEARCH COMPLETE | NOT ACCOUNT RULE CERTIFICATION | NO STRATEGY APPROVAL");

type Direction="LONG"|"SHORT";
type Signal={date:string;kind:"SWEEP_REVERSAL"|"BREAKOUT_CONTINUATION";direction:Direction;entryTime:number;entry:number;stop:number;target:number;exitTime:number;exit:number;exitReason:string;ambiguous:boolean};
const signals:Signal[]=[];
for(const [date,bars] of byDate){
 const opening=bars.slice(0,5);
 const rangeHigh=Math.max(...opening.map(b=>b.high)),rangeLow=Math.min(...opening.map(b=>b.low));
 let availableFrom=5,dayCount=0;
 // No simultaneous positions, 5-minute cooldown, up to 6 opportunities/day.
 for(let i=15;i<bars.length-2&&dayCount<6;i++){
  if(i<availableFrom)continue;
  const b=bars[i]!,previous=bars.slice(i-10,i);
  const prevHigh=Math.max(...previous.map(x=>x.high)),prevLow=Math.min(...previous.map(x=>x.low));
  let kind:Signal["kind"]|null=null,dir:Direction|null=null;
  // Sweeps: current bar trades beyond prior 10-minute extreme but closes back inside.
  if(b.high>prevHigh&&b.close<prevHigh&&b.close<b.open){kind="SWEEP_REVERSAL";dir="SHORT";}
  else if(b.low<prevLow&&b.close>prevLow&&b.close>b.open){kind="SWEEP_REVERSAL";dir="LONG";}
  // Continuation: close through prior 10-minute extreme, aligned with opening-range bias.
  else if(b.close>prevHigh&&b.close>rangeHigh&&b.close>b.open){kind="BREAKOUT_CONTINUATION";dir="LONG";}
  else if(b.close<prevLow&&b.close<rangeLow&&b.close<b.open){kind="BREAKOUT_CONTINUATION";dir="SHORT";}
  if(!kind||!dir)continue;
  const entryBar=bars[i+1]!,entry=entryBar.open,sign=dir==="LONG"?1:-1;
  // Research-only fixed stop/target; no claim that 10 points is structurally appropriate.
  const stop=entry-sign*10,target=entry+sign*40;
  let exit=bars.at(-1)!.close,exitIndex=bars.length-1,reason="SESSION_END",ambiguous=false;
  for(let j=i+1;j<bars.length;j++){
   const x=bars[j]!,stopHit=dir==="LONG"?x.low<=stop:x.high>=stop,targetHit=dir==="LONG"?x.high>=target:x.low<=target;
   if(stopHit){ambiguous=targetHit;exit=dir==="LONG"?Math.min(stop,x.open):Math.max(stop,x.open);exitIndex=j;reason="STOP";break;}
   if(targetHit){exit=target;exitIndex=j;reason="TARGET";break;}
  }
  signals.push({date,kind,direction:dir,entryTime:entryBar.timestampMs,entry,stop,target,exitTime:bars[exitIndex]!.timestampMs,exit,exitReason:reason,ambiguous});
  dayCount++;availableFrom=exitIndex+6;
 }
}
console.log("SIGNAL_CONTRACT "+JSON.stringify({signals:signals.length,days:byDate.size,limitPerDay:6,lookbackBars:10,confirmation:"close of signal bar; next bar open",stopPoints:10,targetPoints:40,onePositionAtATime:true,cooldownBars:5,overnightTrades:false,session:"New York RTH only",noLookaheadForSignals:true,stopPriorityOnAmbiguousBar:true,limitations:"exploratory heuristics, not user-validated setups; NQ proxy for MNQ; no structural stop, fills/orderbook unknown; no out-of-sample validation"}));
for(const kind of ["SWEEP_REVERSAL","BREAKOUT_CONTINUATION","ALL"] as const){
 const subset=kind==="ALL"?signals:signals.filter(s=>s.kind===kind);
 for(const [label,qty,pointValue,commission] of [["5_MNQ",5,10,10],["1_NQ",1,20,5],["2_NQ",2,40,10]] as const){
  // Three ticks per side, tick size 0.25; 1 MNQ tick $0.50, 1 NQ tick $5.
  const slip=label==="5_MNQ"?7.5:label==="1_NQ"?7.5:15;
  const friction=commission+slip;
  let wins=0,net=0,peak=0,maxDrawdown=0,ambiguous=0;
  for(const t of subset){
   const gross=(t.exit-t.entry)*(t.direction==="LONG"?1:-1)*pointValue;
   const pnl=gross-friction;net+=pnl;peak=Math.max(peak,net);maxDrawdown=Math.max(maxDrawdown,peak-net);
   if(pnl>0)wins++;if(t.ambiguous)ambiguous++;
  }
  console.log("SCREEN "+JSON.stringify({kind,position:label,tradeCount:subset.length,winningTrades:wins,winRatePct:subset.length?Math.round(10000*wins/subset.length)/100:null,netUsd:Math.round(net*100)/100,maxClosedTradeEquityDrawdownUsd:Math.round(maxDrawdown*100)/100,ambiguousBars:ambiguous,accountRiskNotYetSimulated:true,frictionPerTradeUsd:friction}));
 }
}
console.log("TM001 MULTI-SETUP DISCOVERY COMPLETE | NOT RISK CERTIFIED | NO STRATEGY APPROVAL");
const money=(n:number)=>Math.round(n*100)/100;
const sizes=[{label:"5_MNQ",usdPerPoint:10,commission:10,slippage:15},{label:"1_NQ",usdPerPoint:20,commission:5,slippage:30},{label:"2_NQ",usdPerPoint:40,commission:10,slippage:60}] as const;
console.log("ASSUMPTIONS "+JSON.stringify({signalCount:signals.length,tradeOrder:"chronological",mllModel:"EOD balance trailing floor, capped at starting balance; unrealized equity intraday",startingBalanceUsd:50000,startingBalanceIllustrative:true,dailyBudgetFractionOfMll:0.15,operatingBudgetFractionOfMll:0.5,slippageTicksPerSide:3,commission:"illustrative, not verified Topstep schedule",positionCosts:sizes.map(x=>({position:x.label,commissionUsd:x.commission,slippageUsd:x.slippage,frictionUsd:x.commission+x.slippage})),limitations:"NQ minute OHLC proxy, intrabar sequence unknowable; liquidation assumed at bar extreme, which can exceed limits; not executable; 28 in-sample sessions; no profit target/consistency rules"}));
for(const size of sizes)for(const mll of [2000,3000]){
 const start=50000,dayBudget=mll*0.15,operatingBudget=mll*0.5,friction=size.commission+size.slippage;
 let balance=start,highEod=start,firstMllTouch:string|null=null,firstOperatingStop:string|null=null,cutoffDays=0,executed=0,skipped=0,minCushion=mll,peak=start,maxClosedDrawdown=0,dayPnl=0,dayStart=start,currentDate="",haltToday=false;
 let stopHits=0,targets=0;
 const ordered=[...signals].sort((a,b)=>a.entryTime-b.entryTime);
 for(const t of ordered){
  if(t.date!==currentDate){
   if(currentDate)highEod=Math.max(highEod,balance); // floor ratchets only after completed trading day
   currentDate=t.date;dayStart=balance;dayPnl=0;haltToday=false;
  }
  if(firstMllTouch||firstOperatingStop||haltToday){skipped++;continue;}
  const floor=Math.min(start,highEod-mll);
  const bars=byDate.get(t.date)!;
  const idx=bars.findIndex(b=>b.timestampMs===t.entryTime);
  if(idx<0)throw Error("MISSING_ENTRY "+t.date);
  const sign=t.direction==="LONG"?1:-1;
  let exit=t.exit,reason=t.exitReason,finished=false;
  // Evaluate only until the signal's independently simulated exit bar.
  for(const b of bars.slice(idx)){
   if(b.timestampMs>t.exitTime)break;
   const worst=t.direction==="LONG"?b.low:b.high;
   const worstPnl=(worst-t.entry)*sign*size.usdPerPoint-friction;
   const worstEquity=balance+worstPnl;
   minCushion=Math.min(minCushion,worstEquity-floor);
   // Worst extreme wins over target when both occur in a minute.
   if(worstEquity<=floor){firstMllTouch=t.date;exit=worst;reason="MLL_TOUCH";finished=true;break;}
   if(worstEquity<=start-operatingBudget){firstOperatingStop=t.date;exit=worst;reason="OPERATING_STOP";finished=true;break;}
   if(dayPnl+worstPnl<=-dayBudget){exit=worst;reason="DAILY_CUTOFF";finished=true;break;}
  }
  if(!finished&&t.exitTime< t.entryTime)throw Error("INVALID_EXIT_TIME");
  const pnl=(exit-t.entry)*sign*size.usdPerPoint-friction;
  balance+=pnl;dayPnl+=pnl;executed++;
  peak=Math.max(peak,balance);maxClosedDrawdown=Math.max(maxClosedDrawdown,peak-balance);
  if(reason==="DAILY_CUTOFF"){cutoffDays++;haltToday=true;}
  if(reason==="STOP")stopHits++;
  if(reason==="TARGET")targets++;
  if(firstMllTouch||firstOperatingStop){haltToday=true;}
 }
 if(currentDate)highEod=Math.max(highEod,balance);
 console.log("SURVIVAL "+JSON.stringify({position:size.label,mllUsd:mll,signalsAvailable:ordered.length,executed,skipped,netUsd:money(balance-start),maxClosedEquityDrawdownUsd:money(maxClosedDrawdown),minimumIntradayCushionUsd:money(minCushion),dailyCutoffDays:cutoffDays,stopHits,targets,firstMllTouch,firstOperatingStop,status:firstMllTouch?"MLL_TOUCH":firstOperatingStop?"OPERATING_STOP":"SURVIVED_SAMPLE",accountProfitTargetNotModeled:true}));
}
console.log("TM001 MULTI-SETUP EOD SCREEN COMPLETE | RESEARCH ONLY | ZERO TRADES");

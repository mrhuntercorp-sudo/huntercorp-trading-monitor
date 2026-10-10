import { CachedHistoricalDays } from "../research/historical-cache.js";
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
// Legacy ORB SCENARIO output retired: incompatible assumptions and misleading costs.
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
// Legacy SCREEN output retired: non-authoritative friction and no account risk model.
const money=(n:number)=>Math.round(n*100)/100;
const sizes=[{label:"5_MNQ",usdPerPoint:10,commission:10,slippage:15},{label:"1_NQ",usdPerPoint:20,commission:5,slippage:30},{label:"2_NQ",usdPerPoint:40,commission:10,slippage:60}] as const;
type Trigger="MLL"|"OPERATING"|"DAILY";
function crossing(entryEquity:number,adverseEquity:number,levels:{name:Trigger;level:number}[]){
 // Higher equity thresholds are encountered first on a monotonically adverse path.
 return levels.filter(x=>entryEquity>x.level&&adverseEquity<=x.level).sort((a,b)=>b.level-a.level)[0]??null;
}
const ordered=[...signals].sort((a,b)=>a.entryTime-b.entryTime);
console.log("INTEGRATED_ASSUMPTIONS "+JSON.stringify({signals:ordered.length,startingBalanceUsd:50000,startingBalanceIllustrative:true,positions:sizes,thresholdModes:["THRESHOLD_PROXY","WORST_BAR_STRESS"],dailyBudgetFractionOfMll:.15,operatingBudgetFractionOfMll:.5,operatingFloor:"EOD_HIGH_MINUS_HALF_MLL_INTERNAL_ONLY",mllFloor:"MIN(START,EOD_HIGH_MINUS_MLL)",dailyFloor:"DAY_START_MINUS_15_PERCENT_MLL",slippageTicksPerSide:3,commissionUnverified:true,limitations:"Minute OHLC cannot order target, stop and risk crossings within the same minute. Threshold proxy assumes execution exactly at limit; stress assumes worst bar extreme. Neither is a tradable fill prediction. Signal selection is independent of risk halts. In-sample only; no account certification."}));
for(const size of sizes)for(const mll of [2000,3000])for(const mode of ["THRESHOLD_PROXY","WORST_BAR_STRESS"] as const){
 const start=50000,friction=size.commission+size.slippage;
 let balance=start,highEod=start,dayStart=start,currentDate="",haltToday=false;
 let firstMllTouch:string|null=null,firstOperatingStop:string|null=null;
 let executed=0,skipped=0,dailyCutoffDays=0,stopHits=0,targets=0,peak=start,maxClosedDrawdown=0,minCushion=mll,minObservedWorstBarCushion=mll,ambiguousRiskBars=0,stopTargetCollisionBars=0,stopRiskCollisionBars=0,gapThroughStopBars=0,gapThroughRiskBars=0,pretradeRejects=0;
 for(const t of ordered){
  if(t.date!==currentDate){
   if(currentDate)highEod=Math.max(highEod,balance);
   currentDate=t.date;dayStart=balance;haltToday=false;
  }
  if(firstMllTouch||firstOperatingStop||haltToday){skipped++;continue;}
  const mllFloor=Math.min(start,highEod-mll);
  const operatingFloor=highEod-mll*.5;
  const dailyFloor=dayStart-mll*.15;
  const levels:{name:Trigger;level:number}[]=[{name:"MLL",level:mllFloor},{name:"OPERATING",level:operatingFloor},{name:"DAILY",level:dailyFloor}];
  if(balance<=mllFloor||balance<=operatingFloor||balance<=dailyFloor){
   pretradeRejects++;skipped++;haltToday=true;
   if(balance<=mllFloor)firstMllTouch=t.date;
   else if(balance<=operatingFloor)firstOperatingStop=t.date;
   continue;
  }
  const bars=byDate.get(t.date)!;
  const idx=bars.findIndex(b=>b.timestampMs===t.entryTime);
  if(idx<0)throw Error("MISSING_ENTRY "+t.date);
  const sign=t.direction==="LONG"?1:-1;
  let exit=t.exit,reason=t.exitReason;
  const entryEquity=balance-friction;
  // Price risk is evaluated through the independent stop/target exit minute.
  // If the threshold and strategy exit share a bar, ordering is unknowable.
  for(const b of bars.slice(idx)){
   if(b.timestampMs>t.exitTime)break;
   const worst=t.direction==="LONG"?b.low:b.high;
   const adverseEquity=balance+(worst-t.entry)*sign*size.usdPerPoint-friction;
   // Observed bar extreme is a stress envelope, not necessarily reachable after an earlier modeled exit.
   minObservedWorstBarCushion=Math.min(minObservedWorstBarCushion,adverseEquity-mllFloor);
   const crossed=crossing(entryEquity,adverseEquity,levels);
   const modeledEquity=crossed&&mode==="THRESHOLD_PROXY"?crossed.level:adverseEquity;
   minCushion=Math.min(minCushion,modeledEquity-mllFloor);
   if(!crossed)continue;
   const stopTouched=t.direction==="LONG"?b.low<=t.stop:b.high>=t.stop;
   const targetTouched=t.direction==="LONG"?b.high>=t.target:b.low<=t.target;
   const stopTargetCollision=stopTouched&&targetTouched;
   const stopRiskCollision=stopTouched;
   const gapThroughStop=t.direction==="LONG"?b.open<=t.stop:b.open>=t.stop;
   const riskPrice=t.entry+(crossed.level-balance+friction)/(sign*size.usdPerPoint);
   const gapThroughRisk=t.direction==="LONG"?b.open<=riskPrice:b.open>=riskPrice;
   if(stopTargetCollision)stopTargetCollisionBars++;
   if(stopRiskCollision)stopRiskCollisionBars++;
   if(gapThroughStop)gapThroughStopBars++;
   if(gapThroughRisk)gapThroughRiskBars++;
   // These flags report uncertainty only: the proxy still cannot determine the intrabar path or executable fill.
   if(b.timestampMs===t.exitTime||stopRiskCollision||stopTargetCollision||gapThroughStop||gapThroughRisk)ambiguousRiskBars++;
   exit=mode==="THRESHOLD_PROXY"?riskPrice:worst;
   reason=crossed.name;
   break;
  }
  const pnl=(exit-t.entry)*sign*size.usdPerPoint-friction;
  balance+=pnl;executed++;
  peak=Math.max(peak,balance);maxClosedDrawdown=Math.max(maxClosedDrawdown,peak-balance);
  if(reason==="MLL"){firstMllTouch=t.date;haltToday=true;}
  else if(reason==="OPERATING"){firstOperatingStop=t.date;haltToday=true;}
  else if(reason==="DAILY"){dailyCutoffDays++;haltToday=true;}
  else if(reason==="STOP")stopHits++;
  else if(reason==="TARGET")targets++;
  // Stress fills may gap through the higher-priority trigger and violate deeper limits.
  if(balance<=mllFloor&&firstMllTouch===null){firstMllTouch=t.date;haltToday=true;}
  if(balance<=operatingFloor&&firstOperatingStop===null){firstOperatingStop=t.date;haltToday=true;}
 }
 if(currentDate)highEod=Math.max(highEod,balance);
 console.log("INTEGRATED_SURVIVAL "+JSON.stringify({mode,position:size.label,mllUsd:mll,signalsAvailable:ordered.length,executed,skipped,pretradeRejects,netUsd:money(balance-start),maxClosedEquityDrawdownUsd:money(maxClosedDrawdown),minimumModeledIntradayCushionUsd:money(minCushion),minimumObservedWorstBarCushionUsd:money(minObservedWorstBarCushion),observedWorstBarCushionIsStressEnvelope:true,dailyCutoffDays,stopHits,targets,ambiguousRiskBars,stopTargetCollisionBars,stopRiskCollisionBars,gapThroughStopBars,gapThroughRiskBars,executionOrderUnresolved:ambiguousRiskBars>0,firstMllTouch,firstOperatingStop,status:firstMllTouch?"MLL_TOUCH":firstOperatingStop?"OPERATING_STOP":"SURVIVED_SAMPLE",accountProfitTargetNotModeled:true}));
}
console.log("TM001 INTEGRATED EOD SCREEN COMPLETE | CACHE ONLY | ZERO TRADES | NOT CERTIFIED");

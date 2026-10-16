/** TM001 exploratory London-high breakout audit. Cache-only, no API, no orders.
 * Descriptive event study, not a strategy or trade simulator.
 */
import {readdir,readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {join} from "node:path";
import {newYorkClock} from "../market/time.js";
import type {MinuteBar} from "../market/types.js";

const folder="data/cache/massive/NQ/NQZ6";
const clock=(b:MinuteBar)=>{const t=newYorkClock(b.timestampMs);return {date:t.date,m:t.hour*60+t.minute};};
const complete=(bars:MinuteBar[],start:number,count:number)=>{
 const minutes=new Set(bars.map(b=>clock(b).m));
 return Array.from({length:count},(_,i)=>start+i).every(m=>minutes.has(m));
};
type RecordData={schema:number;provider:string;ticker:string;productCode:string;utcDate:string;sha256:string;bars:MinuteBar[]};
const records=new Map<string,MinuteBar[]>();
const files=(await readdir(folder)).filter(f=>/^\d{4}-\d{2}-\d{2}(\.research)?\.json$/.test(f)).sort();
for(const file of files){
 const record=JSON.parse(await readFile(join(folder,file),"utf8")) as RecordData;
 if(!Array.isArray(record.bars))throw Error("INVALID_BARS "+file);
 const sha=createHash("sha256").update(JSON.stringify(record.bars)).digest("hex");
 if(record.schema!==1||record.provider!=="massive"||record.ticker!=="NQZ6"||
 record.productCode!=="NQ"||record.sha256!==sha||
 !file.startsWith(record.utcDate+"."))throw Error("CACHE_VALIDATION_FAILED "+file);
 if(record.bars.some((b,i)=>b.contractTicker!=="NQZ6"||b.productCode!=="NQ"||
 !Number.isSafeInteger(b.timestampMs)||b.timestampMs%60000!==0||
 (i>0&&b.timestampMs<=record.bars[i-1]!.timestampMs)))throw Error("INVALID_BAR_ORDER "+file);
 const previous=records.get(record.utcDate);
 if(!previous||record.bars.length>previous.length)records.set(record.utcDate,record.bars);
}
/** Exploratory chronological strategy comparison; cache only, zero orders. */
type Method="IMMEDIATE_SHORT"|"CONFIRMED_SHORT"|"RETEST_SHORT"|"BREAKOUT_LONG";
const methods:Method[]=["IMMEDIATE_SHORT","CONFIRMED_SHORT","RETEST_SHORT","BREAKOUT_LONG"];
type Result={date:string;method:Method;entry:number;signalEt:string;exit:number;reason:string;gross:number;net:number;ambiguous:boolean;barsHeld:number};
const results:Result[]=[];
const byMethod=new Map<Method,{eligible:number;signals:number;skips:number}>(methods.map(m=>[m,{eligible:0,signals:0,skips:0}]));
const STOP=12.5,TARGET=20,COST_POINTS=2,MAX_BARS=30;
console.log("=== TM001 LONDON HIGH ENTRY METHOD COMPARISON ===");
console.log("COMPARE_RULES",JSON.stringify({londonEt:"02:00-08:59",searchEt:"09:30-10:59",contracts:1,
 stopPoints:STOP,targetPoints:TARGET,plannedRiskDollars:250,assumedRoundtripCostDollars:COST_POINTS*20,
 maxHoldBars:MAX_BARS,oneTradePerMethodPerDay:true,stopFirst:true,requests:0,orders:0,
 definitions:{
 IMMEDIATE_SHORT:"First candle high>LondonHigh and close<LondonHigh; short next open",
 CONFIRMED_SHORT:"First rejection; next candle closes below rejection close and below LondonHigh; short following open",
 RETEST_SHORT:"First rejection; within next five bars candle touches LondonHigh from below and closes below it; short following open",
 BREAKOUT_LONG:"First candle closes above LondonHigh after previous candle closed at/below it; long next open"},
 warning:"EXPLORATORY_IN_SAMPLE_MINUTE_BAR_PROXY_COST_ASSUMPTION_NOT_VALIDATED"}));
let excluded=0,eligible=0;
for(const [date,bars] of [...records].sort(([a],[b])=>a.localeCompare(b))){
 const london=bars.filter(b=>{const c=clock(b);return c.date===date&&c.m>=120&&c.m<540;});
 const opening=bars.filter(b=>{const c=clock(b);return c.date===date&&c.m>=570&&c.m<660;});
 if(!complete(london,120,420)||!complete(opening,570,90)){excluded++;continue;}
 eligible++;
 const hi=Math.max(...london.map(b=>b.high));
 const rejection=opening.find(b=>b.high>hi&&b.close<hi);
 const rejectIndex=rejection?bars.findIndex(b=>b.timestampMs===rejection.timestampMs):-1;
 for(const method of methods){
  const stat=byMethod.get(method)!;stat.eligible++;
  let signal:MinuteBar|undefined;
  if(method==="IMMEDIATE_SHORT")signal=rejection;
  if(method==="CONFIRMED_SHORT"&&rejectIndex>=0){
   const next=bars[rejectIndex+1];
   if(next&&next.timestampMs===rejection!.timestampMs+60000&&next.close<rejection!.close&&next.close<hi)signal=next;
  }
  if(method==="RETEST_SHORT"&&rejectIndex>=0){
   for(let k=1;k<=5;k++){
    const b=bars[rejectIndex+k];
    if(!b||b.timestampMs!==rejection!.timestampMs+k*60000)break;
    if(b.open<hi&&b.high>=hi&&b.close<hi){signal=b;break;}
   }
  }
  if(method==="BREAKOUT_LONG"){
   signal=opening.find((b,i)=>i>0&&opening[i-1]!.close<=hi&&b.close>hi);
  }
  if(!signal){stat.skips++;continue;}
  const index=bars.findIndex(b=>b.timestampMs===signal!.timestampMs);
  const path=bars.slice(index+1,index+1+MAX_BARS);
  if(path.length!==MAX_BARS||path.some((b,i)=>b.timestampMs!==signal!.timestampMs+(i+1)*60000)){
   stat.skips++;continue;
  }
  stat.signals++;
  const entry=path[0]!.open,long=method==="BREAKOUT_LONG";
  const stop=long?entry-STOP:entry+STOP,target=long?entry+TARGET:entry-TARGET;
  let exit=path[MAX_BARS-1]!.close,reason="TIME",barsHeld=MAX_BARS,ambiguous=false;
  for(let i=0;i<path.length;i++){
   const b=path[i]!;
   if(i>0&&(long?b.open<=stop:b.open>=stop)){exit=b.open;reason="STOP_GAP";barsHeld=i+1;break;}
   if(i>0&&(long?b.open>=target:b.open<=target)){exit=target;reason="TARGET";barsHeld=i+1;break;}
   const stopHit=long?b.low<=stop:b.high>=stop;
   const targetHit=long?b.high>=target:b.low<=target;
   if(stopHit){exit=stop;reason="STOP";ambiguous=targetHit;barsHeld=i+1;break;}
   if(targetHit){exit=target;reason="TARGET";barsHeld=i+1;break;}
  }
  const gross=Number(((long?exit-entry:entry-exit)*20).toFixed(2));
  const result={date,method,entry,signalEt:clock(signal).m.toString(),exit,reason,
   gross,net:Number((gross-COST_POINTS*20).toFixed(2)),ambiguous,barsHeld};
  results.push(result);console.log("TRADE",JSON.stringify(result));
 }
}
for(const method of methods){
 const t=results.filter(r=>r.method===method),stats=byMethod.get(method)!;
 let equity=0,peak=0,dd=0,streak=0,maxStreak=0;
 for(const r of t){equity+=r.net;peak=Math.max(peak,equity);dd=Math.max(dd,peak-equity);
  streak=r.net<0?streak+1:0;maxStreak=Math.max(maxStreak,streak);}
 console.log("METHOD_SUMMARY",JSON.stringify({method,eligibleDays:stats.eligible,trades:t.length,
 noTradeDays:stats.skips,wins:t.filter(r=>r.net>0).length,losses:t.filter(r=>r.net<0).length,
 grossDollars:t.reduce((s,r)=>s+r.gross,0),estimatedNetDollars:t.reduce((s,r)=>s+r.net,0),
 maxClosedTradeDrawdownDollars:dd,maxConsecutiveLosses:maxStreak,
 ambiguousBars:t.filter(r=>r.ambiguous).length,
 estimatedEndingBalanceDollars:2000+equity,
 note:"METHODS_INDEPENDENT_NOT_A_COMBINED_PORTFOLIO"}));
}
console.log("COMPARE_SUMMARY",JSON.stringify({eligibleDays:eligible,excludedContextDays:excluded,
 sample:"IN_SAMPLE",assumedCostPerTradeDollars:40,
 unmodeled:"SLIPPAGE_MARGIN_REQUIREMENTS_INTRABAR_SEQUENCE_ACCOUNT_RULES",
 requests:0,orders:0,rankingNotValidation:true}));

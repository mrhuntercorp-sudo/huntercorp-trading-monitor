/** TM001 S3 — cached-data-only 09:29 opposite-candle breakout paper audit. */
import {createHash} from "node:crypto";
import {readdir,readFile} from "node:fs/promises";
import {join} from "node:path";
import {newYorkClock} from "../market/time.js";
import type {MinuteBar} from "../market/types.js";
type Cache={schema:number;provider:string;ticker:string;productCode:string;utcDate:string;sha256:string;bars:MinuteBar[]};
const dir=join("data/cache/massive/NQ/NQZ6");
const days=new Map<string,Map<number,MinuteBar>>();
for(const file of (await readdir(dir)).filter(x=>/^\d{4}-\d\d-\d\d(\.research)?\.json$/.test(x))){
 const c=JSON.parse(await readFile(join(dir,file),"utf8")) as Cache;
 if(c.schema!==1||c.provider!=="massive"||c.ticker!=="NQZ6"||c.productCode!=="NQ"||!file.startsWith(c.utcDate+".")||!Array.isArray(c.bars)||createHash("sha256").update(JSON.stringify(c.bars)).digest("hex")!==c.sha256)throw Error("BAD_CACHE "+file);
 for(const b of c.bars){
  const t=newYorkClock(b.timestampMs),m=t.hour*60+t.minute;
  if(!days.has(t.date))days.set(t.date,new Map());
  const d=days.get(t.date)!,prior=d.get(m);
  if(prior&&JSON.stringify(prior)!==JSON.stringify(b))throw Error("CONFLICT "+t.date+" "+m);
  d.set(m,b);
 }
}
const fee=40,slippagePoints=1,tick=.25;
type Outcome="STOP"|"TARGET"|"TIME"|"UNFILLED"|"NO_DATA"|"DOJI";
for(const windowMinutes of [1,5]){
 for(const qty of [1,2]){
  let eligible=0,filled=0,wins=0,losses=0,unfilled=0,doji=0,unknown=0,ambiguous=0,net=0,peak=0,maxDd=0,stoppedOnEntryBar=0;
  console.log("S3_RULES",JSON.stringify({windowMinutes,qty,stopUsd:500,targetUsd:1500,stopPoints:500/(20*qty),targetPoints:1500/(20*qty),entry:"BUY STOP high+0.25 when 09:29 bearish, SELL STOP low-0.25 when bullish",entryWindow:"09:30 onward; expire at end of entry window",exitDeadline:"11:00 ET; if no stop/target exit 10:59 close",feesUsd:fee*qty,slippagePoints,assumption:"stop-first when OHLC cannot determine stop/target sequence",noIntrabarPath:true,apiCalls:0,orders:0}));
  for(const date of [...days.keys()].sort()){
   const d=days.get(date)!,pre=d.get(569);
   if(!pre||!d.get(570)){unknown++;continue;}
   if(pre.close===pre.open){doji++;continue;}
   eligible++;
   const side=pre.close<pre.open?1:-1;
   const trigger=side===1?pre.high+tick:pre.low-tick;
   let entryMinute:number|null=null,entryPrice=trigger;
   for(let m=570;m<570+windowMinutes;m++){
    const b=d.get(m);
    if(!b){entryMinute=null;break;}
    if(side===1?b.high>=trigger:b.low<=trigger){
     entryMinute=m;
     // Stop-entry can gap past trigger; conservative open fill if beyond trigger.
     entryPrice=side===1?Math.max(trigger,b.open):Math.min(trigger,b.open);
     break;
    }
   }
   if(entryMinute===null){
    if(Array.from({length:windowMinutes},(_,i)=>d.has(570+i)).every(Boolean)){unfilled++;console.log("S3_DAY",JSON.stringify({date,qty,windowMinutes,status:"UNFILLED",side:side===1?"LONG":"SHORT"}));}
    else{unknown++;console.log("S3_DAY",JSON.stringify({date,qty,windowMinutes,status:"NO_DATA_ENTRY_WINDOW"}));}
    continue;
   }
   const stop=entryPrice-side*500/(20*qty),target=entryPrice+side*1500/(20*qty);
   let outcome:Outcome="NO_DATA",exitPrice=0,exitMinute=entryMinute,ambiguousBar=false;
   for(let m=entryMinute;m<660;m++){
    const b=d.get(m);
    if(!b)break;
    const hitStop=side===1?b.low<=stop:b.high>=stop;
    const hitTarget=side===1?b.high>=target:b.low<=target;
    // The entry minute may touch stop BEFORE the entry triggers; stop-first is deliberately pessimistic.
    if(hitStop&&hitTarget)ambiguousBar=true;
    if(m===entryMinute&&hitStop)ambiguousBar=true;
    if(hitStop){outcome="STOP";exitPrice=m===entryMinute?stop:(side===1?Math.min(stop,b.open):Math.max(stop,b.open));exitMinute=m;break;}
    if(hitTarget){outcome="TARGET";exitPrice=target;exitMinute=m;break;}
    if(m===659){outcome="TIME";exitPrice=b.close;exitMinute=m;}
   }
   if(outcome==="NO_DATA"){unknown++;console.log("S3_DAY",JSON.stringify({date,qty,windowMinutes,status:"NO_DATA_EXIT_WINDOW",entryMinute}));continue;}
   filled++;
   if(outcome==="STOP")losses++;
   if(outcome==="TARGET")wins++;
   if(outcome==="STOP"&&entryMinute===exitMinute)stoppedOnEntryBar++;
   if(ambiguousBar)ambiguous++;
   const pnl=(exitPrice-entryPrice)*side*20*qty-fee*qty-slippagePoints*20*qty;
   net+=pnl;peak=Math.max(peak,net);maxDd=Math.max(maxDd,peak-net);
   console.log("S3_DAY",JSON.stringify({date,qty,windowMinutes,side:side===1?"LONG":"SHORT",preHigh:pre.high,preLow:pre.low,trigger,entryMinute,entryPrice,stop,target,outcome,exitMinute,exitPrice,netUsd:pnl,ambiguousBar,conservative:true}));
  }
  console.log("S3_SUMMARY",JSON.stringify({windowMinutes,qty,eligible,filled,wins,losses,unfilled,doji,unknown,ambiguous,stoppedOnEntryBar,netUsd:net,maxClosedDrawdownUsd:maxDd,smallSample:true,retrospective:true,notExecutionAccurate:true,apiCalls:0,orders:0}));
 }
}
console.log("S3_AUDIT_END",JSON.stringify({apiCalls:0,orders:0,externalAlerts:0,optimization:false}));

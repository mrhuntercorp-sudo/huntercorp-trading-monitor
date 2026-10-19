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
type Outcome={net:number;exit:number;reason:string;exitIndex:number;favorableAfterExit:number;exitName:ExitName};
const names:ExitName[]=["STEPPED_30_20","STEPPED_40_20"];
type Raw={date:string;entry:number;initialStop:number;risk:number;future:MinuteBar[]};
const raw:Raw[]=[];
let eligible=0,signals=0,blocked=0,rollExcluded=0,incomplete=0;
const simulate=(future:MinuteBar[],entry:number,initialStop:number,risk:number,dollar:number,fee:number,qty:number,exitName:ExitName):Outcome=>{
 let stop=initialStop,lowest=entry,armed=false,exit=future[29]!.close,exitIndex=29,reason="TIME";
 const config=exitName==="STEPPED_30_20"?{activation:30,lock:10}:{activation:40,lock:20};
 for(let i=0;i<future.length;i++){
  const bar=future[i]!;
  if(exitName!=="FIXED_3R"&&armed){
   const steps=Math.floor((entry-lowest-config.activation)/10);
   const candidate=entry-config.lock-steps*10;
   if(candidate<stop)stop=candidate;
  }
  if(i>0&&bar.open>=stop){exit=bar.open;exitIndex=i;reason="STOP_GAP";break;}
  if(bar.high>=stop){exit=stop;exitIndex=i;reason="STOP";break;}
  if(exitName==="FIXED_3R"){
   const target=entry-3*risk;
   if(i>0&&bar.open<=target){exit=bar.open;exitIndex=i;reason="TARGET_GAP";break;}
   if(bar.low<=target){exit=target;exitIndex=i;reason="TARGET";break;}
  }
  lowest=Math.min(lowest,bar.low);
  if(exitName!=="FIXED_3R"&&entry-lowest>=config.activation)armed=true;
 }
 const after=future.slice(exitIndex+1);
 const favorableAfterExit=after.length?round(Math.max(0,entry-Math.min(...after.map(x=>x.low)))):0;
 return {net:round(((entry-exit-1)*dollar-fee)*qty),exit,reason,exitIndex,favorableAfterExit,exitName};
};
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

 raw.push({date,entry,initialStop,risk,future});
}
for(const name of names)for(const budget of [250,350,500]){
 let balance=50000,threshold=48000,peak=50000,maxDd=0,bestDay=0,pass:null|string=null,breach:null|string=null,executed=0,oversized=0,maxInitialRisk=0,netSlippageStress=0;
 for(const t of raw){
  if(pass||breach)break;
  const nqUnit=(t.risk+1)*20+40,mnqUnit=(t.risk+1)*2+4;
  const instrument=nqUnit<=budget?"NQ":"MNQ",dollar=instrument==="NQ"?20:2,fee=instrument==="NQ"?40:4;
  const qty=instrument==="NQ"?Math.max(1,Math.floor(budget/nqUnit)):Math.floor(budget/mnqUnit);
  if(qty<1)continue;
  const o=simulate(t.future,t.entry,t.initialStop,t.risk,dollar,fee,qty,name);
  const worstHigh=Math.max(t.entry,...t.future.slice(0,o.exitIndex+1).map((b,i)=>i===o.exitIndex?Math.max(t.entry,o.exit):b.high));
  const adverse=round(((t.entry-worstHigh-1)*dollar-fee)*qty);
  if(balance+adverse<=threshold){breach=t.date;break;}
  const initialRisk=round((t.risk+1)*dollar*qty+fee*qty);
  maxInitialRisk=Math.max(maxInitialRisk,initialRisk);
  balance=round(balance+o.net);executed++;
  peak=Math.max(peak,balance);maxDd=Math.max(maxDd,peak-balance);
  threshold=Math.min(50000,Math.max(threshold,balance-2000));
  bestDay=Math.max(bestDay,o.net);
  if(o.net>1500)oversized++;
  const stressNet=round(o.net-4*dollar*qty);
  netSlippageStress=round(netSlippageStress+stressNet);
  console.log("EXIT_COMBINE_DAY",JSON.stringify({name,budget,date:t.date,qty,instrument,net:o.net,stressNet,initialRisk,balance,bestDay,consistency55pct:bestDay<=0.55*(balance-50000)}));
  if(balance>=53000&&bestDay<=0.55*(balance-50000))pass=t.date;
 }
 console.log("EXIT_COMBINE_SUMMARY",JSON.stringify({name,budget,signals:raw.length,executed,net:round(balance-50000),pass,breach,bestDay,maxInitialRisk,maxClosedDd:round(maxDd),oversized1500Days:oversized,stressNetSameTrades:netSlippageStress,withinFiveSignalDays:!!pass&&executed<=5,apiCalls:0,orders:0}));
}
console.log("EXIT_COMBINE_CAVEATS",JSON.stringify({notes:["Historical sparse trade dates, not consecutive sessions or prospective pass probabilities","55 percent consistency modeled; verify current account rules","Personal 1500 daily cap reported but not enforced","Four point adverse fill stress is applied to same trades for comparison only, not a re-simulated stop path","Worst intratrade equity is approximated from minute OHLC, not actual tick or Topstep liquidation","No API calls or orders"]}));

/** TM001: read-only 09:29 open double-sweep and EMA14/50 close-cross census. No fills assumed. */
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
let openingDays=0,doubleSweepFirst=0,doubleSweep5=0,doubleSweep15=0,aboveFirst=0,belowFirst=0,neitherFirst=0;
let emaDays=0,crossUp=0,crossDown=0,firstWindow=0;
console.log("=== TM001 OPEN 0929 + EMA14/50 RESEARCH CENSUS ===");
console.log("RULES",JSON.stringify({open:"09:29 completed candle high/low vs 09:30 candle and 09:30-09:34 / 09:30-09:44 windows",ema:"1-minute EMA14/EMA50 computed from chronologically contiguous bars; confirmed close crosses only",intrabarCross:"NOT observable from 1-minute OHLC",limitOrders:"NOT modeled until exact order side, price, stop and cancellation rules confirmed",fees:0,apiCalls:0,orders:0}));
for(const date of [...days.keys()].sort()){
 const d=days.get(date)!;
 const pre=d.get(569),opening=d.get(570);
 if(pre&&opening){
  openingDays++;
  const sweep=(n:number)=>{const bars=Array.from({length:n},(_,i)=>d.get(570+i));if(bars.some(x=>!x))return null;return {up:bars.some(b=>b!.high>pre.high),down:bars.some(b=>b!.low<pre.low)};};
  const s1=sweep(1),s5=sweep(5),s15=sweep(15);
  if(s1?.up&&s1.down)doubleSweepFirst++;
  if(s1?.up&&!s1.down)aboveFirst++;
  if(s1?.down&&!s1.up)belowFirst++;
  if(s1&&!s1.up&&!s1.down)neitherFirst++;
  if(s5?.up&&s5.down)doubleSweep5++;
  if(s15?.up&&s15.down)doubleSweep15++;
  console.log("OPEN_DAY",JSON.stringify({date,preDirection:pre.close>pre.open?"UP":pre.close<pre.open?"DOWN":"DOJI",preHigh:pre.high,preLow:pre.low,first:s1,five:s5,fifteen:s15}));
 }
 const sorted=[...d.entries()].sort((a,b)=>a[0]-b[0]);
 let fast:null|number=null,slow:null|number=null,prevDiff:null|number=null,previousMinute:null|number=null,valid=false,up=0,down=0,morning=0;
 for(const [m,b] of sorted){
  if(previousMinute!==null&&m!==previousMinute+1){fast=null;slow=null;prevDiff=null;}
  previousMinute=m;
  fast=fast===null?b.close:fast+(2/15)*(b.close-fast);
  slow=slow===null?b.close:slow+(2/51)*(b.close-slow);
  // Warm-up: only report when at least 100 contiguous minutes exist.
  const streak=(d.get(m-99)!==undefined&&Array.from({length:100},(_,i)=>d.has(m-i)).every(Boolean));
  if(!streak){prevDiff=null;continue;}
  valid=true;
  const diff=fast-slow;
  if(prevDiff!==null&&((prevDiff<=0&&diff>0)||(prevDiff>=0&&diff<0))){
   const direction=diff>0?"UP":"DOWN";
   if(diff>0)up++;else down++;
   if(m>=570&&m<660)morning++;
   console.log("EMA_CLOSE_CROSS",JSON.stringify({date,minuteEt:`${String(Math.floor(m/60)).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`,direction,close:b.close}));
  }
  prevDiff=diff;
 }
 if(valid){emaDays++;crossUp+=up;crossDown+=down;firstWindow+=morning;}
}
console.log("OPEN_SUMMARY",JSON.stringify({openingDays,doubleSweepFirst,doubleSweep5,doubleSweep15,aboveFirst,belowFirst,neitherFirst,notEntryBacktest:true}));
console.log("EMA_SUMMARY",JSON.stringify({emaDays,crossUp,crossDown,ny0930to1100Crosses:firstWindow,notEntryBacktest:true,emaWarmupApproximation:true}));
console.log("AUDIT_END",JSON.stringify({apiCalls:0,orders:0}));

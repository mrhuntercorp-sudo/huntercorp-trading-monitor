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
const clockMinute=(b:MinuteBar)=>clock(b).m;
const completeCount=(day:Map<number,MinuteBar>|undefined,start:number,count:number)=>day?Array.from({length:count},(_,i)=>start+i).filter(m=>day.has(m)).length:0;
const nextDate=(d:string)=>new Date(Date.parse(d+"T12:00:00Z")+86400000).toISOString().slice(0,10);
const weekday=(d:string)=>{const w=new Date(d+"T12:00:00Z").getUTCDay();return w>=1&&w<=5;};
const first=dates[0]!,last=dates[dates.length-1]!;
let weekdays=0,eligible=0,missing=0,partial=0,rollAmbiguous=0,selected=0;
const rows:{date:string;status:string;contracts:string;bestLondon:number;bestOpen:number;bestFollow:number}[]=[];
for(let date=first;date<=last;date=nextDate(date)){
 if(!weekday(date))continue;
 weekdays++;
 const info=tickers.map(ticker=>{
  const day=byContract.get(ticker)!.get(date);
  return {ticker,london:completeCount(day,120,420),opening:completeCount(day,570,90),follow:completeCount(day,660,30)};
 });
 const complete=info.filter(x=>x.london===420&&x.opening===90&&x.follow===30);
 let status="";
 if(date>="2026-09-14"){
  status=complete.some(x=>x.ticker==="NQZ6")?"ELIGIBLE":complete.length?"COMPLETE_OTHER_CONTRACT":"INCOMPLETE_OR_MISSING";
 }else{
  status=complete.length===1?"ELIGIBLE":complete.length>1?"ROLL_AMBIGUOUS":"INCOMPLETE_OR_MISSING";
 }
 if(status==="ELIGIBLE")eligible++;
 else if(status==="ROLL_AMBIGUOUS")rollAmbiguous++;
 else if(status==="COMPLETE_OTHER_CONTRACT")selected++;
 else {
  const any=info.some(x=>x.london||x.opening||x.follow);
  if(any)partial++;else missing++;
 }
 const ranked=[...info].sort((a,b)=>(b.london+b.opening+b.follow)-(a.london+a.opening+a.follow));
 const best=ranked[0]!;
 rows.push({date,status,contracts:info.filter(x=>x.london||x.opening||x.follow).map(x=>x.ticker+":"+x.london+"/420,"+x.opening+"/90,"+x.follow+"/30").join(";")||"NONE",bestLondon:best.london,bestOpen:best.opening,bestFollow:best.follow});
 console.log("COVERAGE_DAY",JSON.stringify(rows[rows.length-1]));
}

const eligibleDates=rows.filter(x=>x.status==="ELIGIBLE").map(x=>x.date);
const eligibleSet=new Set(eligibleDates);
const prevWeekday=(d:string)=>{let v=new Date(Date.parse(d+"T12:00:00Z")-86400000).toISOString().slice(0,10);while(!weekday(v))v=new Date(Date.parse(v+"T12:00:00Z")-86400000).toISOString().slice(0,10);return v;};
const runs:{first:string;last:string;length:number;dates:string[]}[]=[];
let current:string[]=[];
for(const date of eligibleDates){
 if(current.length&&prevWeekday(date)!==current[current.length-1]){
  runs.push({first:current[0]!,last:current[current.length-1]!,length:current.length,dates:[...current]});current=[];
 }
 current.push(date);
}
if(current.length)runs.push({first:current[0]!,last:current[current.length-1]!,length:current.length,dates:[...current]});
runs.sort((a,b)=>b.length-a.length||a.first.localeCompare(b.first));
const fiveDayWindows=runs.reduce((n,r)=>n+Math.max(0,r.length-4),0);
const twoDayWindows=runs.reduce((n,r)=>n+Math.max(0,r.length-1),0);
console.log("STREAK_SUMMARY",JSON.stringify({eligibleSessions:eligibleDates.length,streaks:runs.length,longest:runs[0]?.length??0,streaksAtLeastFive:runs.filter(x=>x.length>=5).length,verifiedFiveWeekdayWindows:fiveDayWindows,verifiedTwoWeekdayWindows:twoDayWindows,rollAmbiguous,missing,partial,apiCalls:0,orders:0}));
for(const run of runs)console.log("STREAK_RUN",JSON.stringify(run));
console.log("STREAK_CAVEATS",JSON.stringify({notes:["Read-only cache audit, no API calls or orders","Only Monday-Friday adjacency counted; exchange holidays and special sessions not calendar-verified","Gaps cannot be treated as no-signal trading days","Post 2026-09-14 NQZ6 contract selection and existing strict completeness retained","No trading strategy or stop rules changed"]}));

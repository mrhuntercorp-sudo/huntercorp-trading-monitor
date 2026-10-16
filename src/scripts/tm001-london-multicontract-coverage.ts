import {readdir,readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {join} from "node:path";
import {newYorkClock} from "../market/time.js";
import type {MinuteBar} from "../market/types.js";

const root="data/cache/massive/NQ";
type RecordData={schema:number;provider:string;ticker:string;productCode:string;utcDate:string;sha256:string;bars:MinuteBar[]};
let researchSelected=0,standardSelected=0;
const tickers=(await readdir(root,{withFileTypes:true})).filter(x=>x.isDirectory()&&/^NQ[A-Z][0-9]$/.test(x.name)).map(x=>x.name).sort();
const byContract=new Map<string,Map<string,Map<number,MinuteBar>>>();
for(const ticker of tickers){
 const days=new Map<string,Map<number,MinuteBar>>();
 const names=(await readdir(join(root,ticker))).filter(x=>/^\\d{4}-\\d{2}-\\d{2}(\\.research)?\\.json$/.test(x)).sort();
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
const missing=(day:Map<number,MinuteBar>,start:number,end:number)=>{let n=0;for(let m=start;m<end;m++)if(!day.has(m))n++;return n;};
const dates=[...new Set([...byContract.values()].flatMap(days=>[...days.keys()]))].sort();
console.log("=== TM001 MULTI-CONTRACT LONDON SWEEP COVERAGE ===");
console.log("RULES "+JSON.stringify({readOnly:true,apiCalls:0,writes:0,orders:0,signalsCalculated:false,rollSelectionApproved:false,cacheSelection:"longest validated UTC-day record, standard or research",windowsEt:{london:"02:00-08:59",signal:"09:30-10:59",exitCoverage:"11:00-11:29"}}));
let unique=0,ambiguous=0,partial=0;
for(const date of dates){
 const candidates:string[]=[];
 const diagnostics:object[]=[];
 for(const ticker of tickers){
  const day=byContract.get(ticker)!.get(date);
  if(!day)continue;
  const londonMissing=missing(day,120,540),signalMissing=missing(day,570,660),exitMissing=missing(day,660,690);
  diagnostics.push({ticker,londonMissing,signalMissing,exitMissing});
  if(londonMissing===0&&signalMissing===0&&exitMissing===0)candidates.push(ticker);
 }
 if(!diagnostics.length)continue;
 const status=candidates.length===1?"UNIQUE_COMPLETE":candidates.length>1?"ROLL_REVIEW": "INCOMPLETE";
 if(status==="UNIQUE_COMPLETE")unique++;else if(status==="ROLL_REVIEW")ambiguous++;else partial++;
 console.log("LONDON_COVERAGE "+JSON.stringify({date,status,completeContracts:candidates,diagnostics,afterOriginalSampleWindow:date>"2026-10-09",sampleOverlapUnknown:true}));
}
console.log("COVERAGE_SUMMARY "+JSON.stringify({contracts:tickers.length,dates:dates.length,researchFilesSelected:researchSelected,standardFilesSelected:standardSelected,uniqueComplete:unique,rollReview:ambiguous,incomplete:partial,apiCalls:0,writes:0,orders:0,warning:"Coverage only; no strategy evaluation or approval. Older dates are retrospective holdout candidates, not forward validation."}));

/** E019: verify cached prior-session NQ contract evidence. Read-only, no API, no orders. */
import {existsSync,readFileSync} from "node:fs";
import {resolve} from "node:path";
import {createHash} from "node:crypto";
import {newYorkClock} from "../market/time.js";
import {auditRthCoverage} from "../research/rth-coverage.js";
import type {MinuteBar} from "../market/types.js";

if(process.argv.length>3)throw Error("E019_USAGE: [YYYY-MM-DD] [NQZ6|NQH7]");
const date=process.argv[2]??"2026-10-15";
const preferred=process.argv[3]??"NQZ6";
const valid=(d:string)=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d+"T00:00:00Z"))&&new Date(d+"T00:00:00Z").toISOString().slice(0,10)===d;
if(!valid(date)||date<"2026-10-15"||!["NQZ6","NQH7"].includes(preferred))throw Error("E019_INVALID_ARGUMENT");
const before=(d:string)=>new Date(Date.parse(d+"T00:00:00Z")-86400000).toISOString().slice(0,10);
let previous=before(date);
while([0,6].includes(new Date(previous+"T00:00:00Z").getUTCDay()))previous=before(previous);
const load=(ticker:string)=>{
 const utcDates=[before(previous),previous];
 const files=utcDates.map(d=>resolve("data/cache/massive/NQ",ticker,d+".json"));
 if(files.some(f=>!existsSync(f)))return {ticker,status:"MISSING_CACHE" as const,files,volume:null,coverage:null};
 const all:MinuteBar[]=[];
 for(let i=0;i<files.length;i++){
  const record=JSON.parse(readFileSync(files[i],"utf8")) as {schema:number;ticker:string;utcDate:string;sha256:string;bars:MinuteBar[]};
  if(record.schema!==1||record.ticker!==ticker||record.utcDate!==utcDates[i]||!Array.isArray(record.bars)||
   createHash("sha256").update(JSON.stringify(record.bars)).digest("hex")!==record.sha256)
   return {ticker,status:"INVALID_CACHE" as const,files,volume:null,coverage:null};
  all.push(...record.bars);
 }
 try{
  const coverage=auditRthCoverage(all,previous,ticker);
  if(coverage.status!=="COMPLETE")return {ticker,status:"INCOMPLETE_RTH" as const,files,volume:null,coverage};
  const volume=all.filter(b=>{const c=newYorkClock(b.timestampMs);return c.date===previous&&c.hour*60+c.minute>=570&&c.hour*60+c.minute<960;})
   .reduce((sum,b)=>sum+b.volume,0);
  if(!Number.isSafeInteger(volume)||volume<0)throw Error("BAD_VOLUME");
  return {ticker,status:"VERIFIED_CACHE" as const,files,volume,coverage};
 }catch{return {ticker,status:"INVALID_RTH" as const,files,volume:null,coverage:null};}
};
const z=load("NQZ6"),h=load("NQH7");
const both=z.status==="VERIFIED_CACHE"&&h.status==="VERIFIED_CACHE";
const selected=both?(z.volume!>h.volume!?"NQZ6":h.volume!>z.volume!?"NQH7":null):null;
console.log("E019_PRIOR_SESSION",JSON.stringify({tradeDate:date,priorWeekday:previous,observations:[z,h],selectedTicker:selected,preferredTicker:preferred,matchingPreferred:selected===preferred}));
console.log("E019_GATE",JSON.stringify({status:both&&selected?"VOLUME_COMPARISON_VERIFIED":"REVIEW_REQUIRED",completeBothContracts:both,selectionVerified:both&&selected!==null,calendarVerified:false,providerCostVerified:false,retrievalAuthorized:false,apiRequests:0,writes:0,orders:0}));

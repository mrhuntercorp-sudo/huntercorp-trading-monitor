/** October 15 partial-cache refresh. Read-only by default; one explicitly approved request.
 * Never replace cached data unless all 390 RTH minutes are present and valid.
 */
import {createHash} from "node:crypto";
import {readFile,rename,rm,writeFile} from "node:fs/promises";
import {join} from "node:path";
import {auditRthCoverage} from "../research/rth-coverage.js";
import {rthBars} from "../research/level-reclaim.js";
import type {MinuteBar} from "../market/types.js";

const ticker="NQZ6", date="2026-10-15";
const path=join("data/cache/massive/NQ",ticker,date+".json");
const current=JSON.parse(await readFile(path,"utf8")) as {
 schema:number;provider:string;ticker:string;productCode:string;utcDate:string;sha256:string;bars:MinuteBar[];
};
const digest=(bars:MinuteBar[])=>createHash("sha256").update(JSON.stringify(bars)).digest("hex");
if(current.schema!==1||current.provider!=="massive"||current.ticker!==ticker||
 current.productCode!=="NQ"||current.utcDate!==date||!Array.isArray(current.bars)||
 digest(current.bars)!==current.sha256)throw Error("INVALID_EXISTING_CACHE");
const oldAudit=auditRthCoverage(rthBars(current.bars,date),date,ticker);
console.log("OCT15_EXISTING",JSON.stringify({utcBars:current.bars.length,rthBars:oldAudit.observedMinutes,status:oldAudit.status}));
if(oldAudit.status==="COMPLETE"){console.log("OCT15_REFRESH",JSON.stringify({status:"ALREADY_COMPLETE",requests:0}));process.exit(0);}
if(process.env.TM001_APPROVE_OCT15_REFRESH!=="YES"){
 console.log("OCT15_REFRESH",JSON.stringify({status:"DRY_RUN",requests:0,cachePreserved:true}));process.exit(0);
}
const key=process.env.MASSIVE_API_KEY?.trim();
if(!key)throw Error("MASSIVE_API_KEY_MISSING");
const url=new URL("https://api.massive.com/futures/v1/aggs/"+ticker);
url.searchParams.set("resolution","1min");
url.searchParams.set("window_start.gte",date);
url.searchParams.set("window_start.lt","2026-10-16");
url.searchParams.set("sort","window_start.asc");
url.searchParams.set("limit","50000");
const response=await fetch(url,{headers:{Authorization:"Bearer "+key},signal:AbortSignal.timeout(20000)});
if(!response.ok)throw Error("MASSIVE_HTTP_"+response.status);
const payload=await response.json() as {results?:Array<{
 ticker?:string;window_start?:number;session_end_date?:string;open?:number;high?:number;
 low?:number;close?:number;volume?:number;
}>;next_url?:string};
if(payload.next_url)throw Error("PAGINATION_REQUIRED_NO_OVERWRITE");
const start=Date.parse(date+"T00:00:00Z");
const bars:MinuteBar[]=(payload.results??[]).map(r=>{
 const timestampMs=r.window_start===undefined?NaN:Math.floor(r.window_start/1000000);
 if((r.ticker!==undefined&&r.ticker!==ticker)||!r.session_end_date||
  !Number.isSafeInteger(timestampMs)||timestampMs<start||timestampMs>=start+86400000||
  timestampMs%60000!==0||[r.open,r.high,r.low,r.close,r.volume].some(v=>typeof v!=="number"||!Number.isFinite(v))||
  r.low!>Math.min(r.open!,r.close!)||r.high!<Math.max(r.open!,r.close!)||
  r.low!>r.high!||r.volume!<0)throw Error("INVALID_PROVIDER_BAR");
 return {contractTicker:ticker,productCode:"NQ",timestampMs,sessionEndDate:r.session_end_date,
  open:r.open!,high:r.high!,low:r.low!,close:r.close!,volume:r.volume!};
}).sort((a,b)=>a.timestampMs-b.timestampMs);
if(bars.some((b,i)=>i>0&&b.timestampMs<=bars[i-1]!.timestampMs))throw Error("DUPLICATE_PROVIDER_BARS");
const audit=auditRthCoverage(rthBars(bars,date),date,ticker);
console.log("OCT15_CANDIDATE",JSON.stringify({utcBars:bars.length,rthBars:audit.observedMinutes,
 missingRthMinutes:audit.missingMinutes,status:audit.status,
 latestUtc:bars.length?new Date(bars.at(-1)!.timestampMs).toISOString():null,requests:1}));
if(audit.status!=="COMPLETE"){
 console.log("OCT15_REFRESH",JSON.stringify({status:"INCOMPLETE_NO_OVERWRITE",cachePreserved:true,requests:1}));process.exit(0);
}
if(bars.length<current.bars.length)throw Error("SHORTER_CANDIDATE_REFUSED");
const next={schema:1,provider:"massive",ticker,productCode:"NQ",utcDate:date,sha256:digest(bars),bars};
const temp=path+"."+process.pid+".tmp";
try{
 await writeFile(temp,JSON.stringify(next),{flag:"wx"});
 const disk=JSON.parse(await readFile(path,"utf8")) as {sha256?:string};
 if(disk.sha256!==current.sha256)throw Error("CACHE_CHANGED_DURING_FETCH");
 await rename(temp,path);
}finally{await rm(temp,{force:true});}
console.log("OCT15_REFRESH",JSON.stringify({status:"COMPLETE_CACHE_REPLACED",oldBars:current.bars.length,
 newBars:bars.length,requests:1,phonePublishes:0,orders:0}));

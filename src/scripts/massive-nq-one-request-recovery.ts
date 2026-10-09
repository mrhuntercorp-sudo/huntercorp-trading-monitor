import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { MinuteBar } from "../market/types.js";

const ticker="NQZ6", date="2026-09-18";
const root="data/cache/massive/NQ";
const path=join(root,ticker,date+".json");
const live=process.argv.includes("--execute");
const key=process.env.MASSIVE_API_KEY?.trim();
console.log("=== TM001 ONE-REQUEST NQZ6 RECOVERY ===");
console.log(`TARGET ${ticker} ${date} UTC | NO RETRIES | NO PAGINATION | NO SPEND AUTHORITY`);
if(!live){console.log("DRY_RUN: no API calls, no writes; pass --execute after approval");process.exit(0);}
if(!key)throw Error("MASSIVE_API_KEY missing; no request made");
try{await readFile(path,"utf8");throw Error("CACHE_ALREADY_EXISTS: refusing overwrite or request");}
catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}
const url=new URL("/futures/v1/aggs/NQZ6","https://api.massive.com");
url.searchParams.set("resolution","1min");
url.searchParams.set("window_start.gte",date);
url.searchParams.set("window_start.lt","2026-09-19");
url.searchParams.set("limit","50000");
url.searchParams.set("sort","window_start.asc");
url.searchParams.set("apiKey",key);
let requests=0;
const controller=new AbortController();
const timeout=setTimeout(()=>controller.abort(),30000);
let payload: {status?:string;results?:Array<{ticker?:string;window_start?:number;session_end_date?:string;open?:number;high?:number;low?:number;close?:number;volume?:number}>;next_url?:string};
try{
 requests++;
 const response=await fetch(url,{signal:controller.signal,redirect:"error"});
 if(!response.ok)throw Error("Massive HTTP "+response.status+"; no cache written");
 payload=await response.json() as typeof payload;
}finally{clearTimeout(timeout);}
if(payload.status && payload.status!=="OK")throw Error("Provider status not OK");
if(payload.next_url)throw Error("PAGINATION_REQUIRED: refusing second request and cache write");
if(!Array.isArray(payload.results)||!payload.results.length)throw Error("EMPTY_RESPONSE: refusing cache write");
const start=Date.parse(date+"T00:00:00Z");
const bars:MinuteBar[]=[];
for(const r of payload.results){
 if(r.ticker && r.ticker!==ticker)throw Error("Unexpected ticker");
 if(typeof r.window_start!=="number"||!Number.isFinite(r.window_start)||!r.session_end_date||![r.open,r.high,r.low,r.close,r.volume].every(v=>typeof v==="number"&&Number.isFinite(v)))throw Error("Invalid provider bar");
 const timestampMs=Math.floor(r.window_start!/1000000);
 if(!Number.isSafeInteger(timestampMs)||timestampMs<start||timestampMs>=start+86400000||timestampMs%60000!==0)throw Error("Outside requested UTC day");
 if(r.volume!<0||r.low!>Math.min(r.open!,r.close!)||r.high!<Math.max(r.open!,r.close!)||r.low!>r.high!)throw Error("Invalid OHLCV");
 bars.push({contractTicker:ticker,productCode:"NQ",timestampMs,sessionEndDate:r.session_end_date!,open:r.open!,high:r.high!,low:r.low!,close:r.close!,volume:r.volume!});
}
bars.sort((a,b)=>a.timestampMs-b.timestampMs);
if(bars.some((b,i)=>i>0&&b.timestampMs<=bars[i-1]!.timestampMs))throw Error("Duplicate timestamps");
const sha256=createHash("sha256").update(JSON.stringify(bars)).digest("hex");
await mkdir(join(root,ticker),{recursive:true});
const temporary=path+"."+process.pid+".tmp";
try{await writeFile(temporary,JSON.stringify({schema:1,provider:"massive",ticker,productCode:"NQ",utcDate:date,sha256,bars}),{flag:"wx"});await rename(temporary,path);}
finally{await rm(temporary,{force:true});}
console.log("RECOVERY_RESULT "+JSON.stringify({ticker,date,requests,bars:bars.length,firstUtc:new Date(bars[0]!.timestampMs).toISOString(),lastUtc:new Date(bars.at(-1)!.timestampMs).toISOString(),cacheWritten:true,sessionApproval:false}));
